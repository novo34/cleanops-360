-- PROPUESTO / REVIEW ONLY. Not a migration. Never auto-installed.
-- Requires exact owner approval of these bytes, ACL, dependencies and isolated trial.
-- Product activation remains DENIED pending organization/feature_flags linkage.
BEGIN;

-- Specific field validators shared by constraints and RPC. No permission decisions.
CREATE FUNCTION identity_private.crm_company_fields_valid(f jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE k text; bound integer;
BEGIN
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR NOT(f ?& ARRAY['name','city','sector','relation'])
 OR f-ARRAY['name','city','sector','relation']<>'{}'::jsonb THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['name','city','sector'] LOOP
  bound:=CASE k WHEN 'name' THEN 160 ELSE 120 END;
  IF jsonb_typeof(f->k) IS DISTINCT FROM 'string' OR length(f->>k) NOT BETWEEN 1 AND bound
  OR (f->>k) !~ '[^[:space:]]' OR (f->>k) ~ '[[:cntrl:]]' THEN RETURN false;END IF;
 END LOOP;
 RETURN jsonb_typeof(f->'relation')='string' AND f->>'relation' IN('PROSPECT','CUSTOMER');
END $fn$;
CREATE FUNCTION identity_private.crm_contact_fields_valid(f jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $fn$
DECLARE k text;bound integer;v text;
BEGIN
 IF jsonb_typeof(f) IS DISTINCT FROM 'object'
 OR NOT(f ?& ARRAY['name','email','roles','data_source','source_url','first_seen_at','last_verified_at','communication_basis','do_not_contact','privacy_request_status','retention_review_at'])
 OR f-ARRAY['name','email','roles','data_source','source_url','first_seen_at','last_verified_at','communication_basis','do_not_contact','privacy_request_status','retention_review_at']<>'{}'::jsonb
 OR jsonb_typeof(f->'do_not_contact') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(f->'roles') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(f->'roles') NOT BETWEEN 1 AND 8
 OR NOT(f->'roles' <@ '["BAULEITER","PROJEKTLEITER","FACILITY_MANAGER","OBJEKTLEITER","EINKAUF","BAUMANAGEMENT","ADMINISTRATION","MANAGEMENT"]'::jsonb)
 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(f->'roles'))<>jsonb_array_length(f->'roles') THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['name','email','data_source','source_url','communication_basis','privacy_request_status'] LOOP
  IF f->k='null'::jsonb AND k IN('source_url','communication_basis','privacy_request_status') THEN CONTINUE;END IF;
  bound:=CASE k WHEN 'name' THEN 160 WHEN 'email' THEN 254 WHEN 'data_source' THEN 200 WHEN 'source_url' THEN 2048 WHEN 'communication_basis' THEN 500 ELSE 120 END;
  v:=f->>k;
  IF jsonb_typeof(f->k) IS DISTINCT FROM 'string' OR length(v) NOT BETWEEN 1 AND bound
  OR v !~ '[^[:space:]]' OR v ~ '[[:cntrl:]]' THEN RETURN false;END IF;
  IF k='email' AND v !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RETURN false;END IF;
  IF k='source_url' AND v !~ '^https://[^[:space:]]+$' THEN RETURN false;END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['first_seen_at','last_verified_at','retention_review_at'] LOOP
  IF f->k='null'::jsonb AND k<>'first_seen_at' THEN CONTINUE;END IF;
  v:=f->>k;
  IF jsonb_typeof(f->k) IS DISTINCT FROM 'string' OR length(v)>35
  OR v !~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN false;END IF;
  PERFORM v::timestamptz;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $fn$;
-- Audit projections retain actor/correlation, versions, changed field names and
-- suppression/role transitions, without copying names/emails/URLs/legal free text.
-- Durable semantic denials return to B1, which discards its owned reservation and
-- commits this audit. Infrastructure errors remain thrown and roll back all effects.
CREATE FUNCTION identity_private.crm_denied(op text,failure text,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','crm.change.denied',NULL,'DENY',corr,clock_timestamp(),jsonb_build_object('operation',op,'code',failure));
 RETURN jsonb_build_object('error',failure);
END $fn$;

CREATE TABLE app.crm_companies (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id), id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 city text NOT NULL CHECK(length(btrim(city)) BETWEEN 1 AND 120),
 sector text NOT NULL CHECK(length(btrim(sector)) BETWEEN 1 AND 120),
 relation text NOT NULL CHECK(relation IN('PROSPECT','CUSTOMER')),
 CHECK(identity_private.crm_company_fields_valid(jsonb_build_object('name',name,'city',city,'sector',sector,'relation',relation))),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9999999999999999),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,id) REFERENCES app.access_resources(tenant_id,id)
);
CREATE TABLE app.crm_contacts (
 tenant_id uuid NOT NULL, id uuid NOT NULL, company_id uuid NOT NULL,
 fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='object'),
 do_not_contact_at timestamptz,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,company_id) REFERENCES app.crm_companies(tenant_id,id),
 CHECK(identity_private.crm_contact_fields_valid(fields)),
 CHECK((fields->>'do_not_contact')::boolean=(do_not_contact_at IS NOT NULL))
);
-- Tenant-scoped suppression is retained when a contact's email changes. Removal
-- is deliberately excluded from CRM-01; unchecking a suppressed identity is denied.
CREATE TABLE app.crm_suppression (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id),email text NOT NULL,
 marked_at timestamptz NOT NULL,actor_user_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,email),FOREIGN KEY(tenant_id,actor_user_id) REFERENCES app.users(tenant_id,id)
);
CREATE INDEX crm_contacts_company ON app.crm_contacts(tenant_id,company_id);
DO $body$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['crm_companies','crm_contacts','crm_suppression'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO cleanops_auth_broker',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY broker_tenant ON app.%I TO cleanops_auth_broker USING(tenant_id=identity_private.verified_tenant()) WITH CHECK(tenant_id=identity_private.verified_tenant())',t);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker',t);
 END LOOP;
END $body$;

-- This is an explicit approval boundary, NOT a runtime flag or an entitlement engine.
-- No guessed mapping between public.organizations and app.organizations is installed.
-- Replace only after owner approves the linkage, flag key and locking/disable policy,
-- then re-hash/review this one canonical candidate before any positive integration trial.
CREATE FUNCTION identity_private.crm_module_guard() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 PERFORM identity_private.context();
 RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';
END $fn$;

CREATE FUNCTION auth_api.crm_company(target uuid,after_contact uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; result jsonb;
BEGIN
 c:=identity_private.context(); PERFORM identity_private.crm_module_guard();
 IF NOT auth_api.effective_access('view','companies',target) THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'sector',p.sector,'relation',p.relation,'version',p.version::text,
 'can_edit',auth_api.effective_access('edit','companies',p.id),
 'contacts_next_after',CASE WHEN (SELECT count(*) FROM (SELECT x.id FROM app.crm_contacts x WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND (after_contact IS NULL OR x.id>after_contact) AND auth_api.effective_access('view','contacts',x.id) ORDER BY x.id LIMIT 2) n)>1 THEN (SELECT x.id FROM app.crm_contacts x WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND (after_contact IS NULL OR x.id>after_contact) AND auth_api.effective_access('view','contacts',x.id) ORDER BY x.id LIMIT 1) ELSE NULL END,
 'contacts',coalesce((SELECT jsonb_agg(x.fields||jsonb_build_object('id',x.id,'can_suppress',EXISTS(SELECT 1 FROM auth_api.binding_authorization(NULL,'contacts.suppress',x.id) a WHERE a.allowed),'do_not_contact',x.do_not_contact_at IS NOT NULL OR EXISTS(SELECT 1 FROM app.crm_suppression s WHERE s.tenant_id=c.tenant_id AND s.email=lower(btrim(x.fields->>'email'))),'do_not_contact_at',coalesce(x.do_not_contact_at,(SELECT s.marked_at FROM app.crm_suppression s WHERE s.tenant_id=c.tenant_id AND s.email=lower(btrim(x.fields->>'email'))))) ORDER BY x.id)
 FROM (SELECT x.* FROM app.crm_contacts x WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND (after_contact IS NULL OR x.id>after_contact) AND auth_api.effective_access('view','contacts',x.id) ORDER BY x.id LIMIT 1) x),'[]'::jsonb))
 INTO result FROM app.crm_companies p WHERE p.tenant_id=c.tenant_id AND p.id=target;
 IF result IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF octet_length(result::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT';END IF;
 RETURN result;
END $fn$;
CREATE FUNCTION auth_api.crm_companies(search_text text,clients_only boolean,after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;result jsonb;
BEGIN
 c:=identity_private.context();PERFORM identity_private.crm_module_guard();
 IF search_text IS NULL OR length(search_text)>120 OR search_text ~ '[[:cntrl:]]' OR clients_only IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF NOT auth_api.effective_access('view','companies',NULL) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 WITH visible AS MATERIALIZED (
  SELECT p.id FROM app.crm_companies p WHERE p.tenant_id=c.tenant_id AND (after_id IS NULL OR p.id>after_id)
  AND (NOT clients_only OR p.relation='CUSTOMER') AND auth_api.effective_access('view','companies',p.id)
  AND (strpos(lower(p.name),lower(search_text))>0 OR EXISTS(SELECT 1 FROM app.crm_contacts x
   WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND auth_api.effective_access('view','contacts',x.id)
   AND (strpos(lower(x.fields->>'name'),lower(search_text))>0 OR strpos(lower(x.fields->>'email'),lower(search_text))>0)))
  ORDER BY p.id LIMIT 6
 ),page AS MATERIALIZED(SELECT id FROM visible ORDER BY id LIMIT 5)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'sector',p.sector,'relation',p.relation,
 'contact_name',(SELECT x.fields->>'name' FROM app.crm_contacts x WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND auth_api.effective_access('view','contacts',x.id) ORDER BY x.id LIMIT 1),
 'contact_count',(SELECT count(*) FROM app.crm_contacts x WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND auth_api.effective_access('view','contacts',x.id))) ORDER BY p.id)
 FROM page JOIN app.crm_companies p ON p.tenant_id=c.tenant_id AND p.id=page.id),'[]'::jsonb),
 'next_after',CASE WHEN (SELECT count(*) FROM visible)>5 THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 IF octet_length(result::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT';END IF;
 RETURN result;
END $fn$;

CREATE FUNCTION auth_api.crm_change(payload jsonb,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; p app.crm_companies; before_safe jsonb; after_safe jsonb;
 op text;target uuid;contact_id uuid;f jsonb; before_contact app.crm_contacts; required_keys text[];email_value text;marked timestamptz;v bigint;
BEGIN
 c:=identity_private.context();
 IF corr IS NULL OR key_hash IS NULL OR request_hash IS NULL OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32 THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 PERFORM 1 FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.operation='changeCrmRecord'
 AND r.key_digest=key_hash AND r.request_digest=request_hash AND r.state='PENDING' AND r.one_time_result
 AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id() AND r.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 BEGIN
  PERFORM identity_private.crm_module_guard();
 EXCEPTION WHEN insufficient_privilege THEN RETURN identity_private.crm_denied(NULL,'POLICY_DENIED',corr);
 END;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>identity_private.cfg('json_body_max') THEN RETURN identity_private.crm_denied(NULL,'INVALID_INPUT',corr);END IF;
 op:=payload->>'operation';
 IF op NOT IN('CREATE_COMPANY','EDIT_COMPANY','CREATE_CONTACT','EDIT_CONTACT') OR op IS NULL THEN RETURN identity_private.crm_denied(NULL,'INVALID_INPUT',corr);END IF;
 required_keys:=CASE op WHEN 'CREATE_COMPANY' THEN ARRAY['operation','company'] WHEN 'EDIT_COMPANY' THEN ARRAY['operation','company_id','expected_version','reason','company'] WHEN 'CREATE_CONTACT' THEN ARRAY['operation','company_id','expected_version','reason','contact'] ELSE ARRAY['operation','company_id','expected_version','reason','contact_id','contact'] END;
 IF NOT(payload ?& required_keys) OR payload-required_keys<>'{}'::jsonb
 OR (op IN('CREATE_COMPANY','EDIT_COMPANY') AND identity_private.crm_company_fields_valid(payload->'company') IS DISTINCT FROM true)
 OR (op IN('CREATE_CONTACT','EDIT_CONTACT') AND identity_private.crm_contact_fields_valid(payload->'contact') IS DISTINCT FROM true) THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
 IF op<>'CREATE_COMPANY' THEN
  IF jsonb_typeof(payload->'company_id') IS DISTINCT FROM 'string' OR (payload->>'company_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(payload->'expected_version') IS DISTINCT FROM 'string' OR (payload->>'expected_version') !~ '^[1-9][0-9]{0,15}$'
  OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR length(payload->>'reason') NOT BETWEEN 1 AND 500 OR (payload->>'reason') !~ '[^[:space:]]' OR (payload->>'reason') ~ '[[:cntrl:]]' THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
 END IF;
 IF op='EDIT_CONTACT' AND (jsonb_typeof(payload->'contact_id') IS DISTINCT FROM 'string' OR (payload->>'contact_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
 IF op='CREATE_COMPANY' THEN
  IF NOT auth_api.effective_access('create','companies',NULL) THEN RETURN identity_private.crm_denied(op,'POLICY_DENIED',corr);END IF;
  target:=gen_random_uuid();f:=payload->'company';
  INSERT INTO app.access_resources(tenant_id,id,kind) VALUES(c.tenant_id,target,'companies');
  INSERT INTO app.crm_companies(tenant_id,id,name,city,sector,relation) VALUES(c.tenant_id,target,f->>'name',f->>'city',f->>'sector',f->>'relation') RETURNING version INTO v;
  before_safe:=NULL;after_safe:=jsonb_build_object('company_id',target,'version',v::text,'relation',f->'relation','changed_fields',jsonb_build_array('name','city','sector','relation'));
 ELSE
  target:=(payload->>'company_id')::uuid;
  IF NOT auth_api.effective_access('view','companies',target) THEN RETURN identity_private.crm_denied(op,'NOT_FOUND',corr);END IF;
  SELECT * INTO p FROM app.crm_companies WHERE tenant_id=c.tenant_id AND id=target FOR UPDATE;
  IF NOT FOUND THEN RETURN identity_private.crm_denied(op,'NOT_FOUND',corr);END IF;
  IF NOT auth_api.effective_access('edit','companies',target) THEN RETURN identity_private.crm_denied(op,'POLICY_DENIED',corr);END IF;
  IF p.version::text IS DISTINCT FROM payload->>'expected_version' THEN RETURN identity_private.crm_denied(op,'CRM_CONFLICT',corr);END IF;
  IF length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 500 OR payload->>'reason' IS NULL THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
  before_safe:=jsonb_build_object('company_id',target,'version',p.version::text,'relation',p.relation);
  IF op='EDIT_COMPANY' THEN
   f:=payload->'company';
   UPDATE app.crm_companies SET name=f->>'name',city=f->>'city',sector=f->>'sector',relation=f->>'relation' WHERE tenant_id=c.tenant_id AND id=target;
  ELSE
   f:=payload->'contact';contact_id:=CASE WHEN op='CREATE_CONTACT' THEN gen_random_uuid() ELSE (payload->>'contact_id')::uuid END;
   IF NOT auth_api.effective_access(CASE WHEN op='CREATE_CONTACT' THEN 'create' ELSE 'edit' END,'contacts',CASE WHEN op='CREATE_CONTACT' THEN NULL ELSE contact_id END) THEN RETURN identity_private.crm_denied(op,'POLICY_DENIED',corr);END IF;
   IF op='EDIT_CONTACT' AND NOT EXISTS(SELECT 1 FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND id=contact_id AND company_id=target) THEN RETURN identity_private.crm_denied(op,'NOT_FOUND',corr);END IF;
   IF op='CREATE_CONTACT' AND (SELECT count(*) FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND company_id=target)>=100 THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
   IF op='EDIT_CONTACT' AND (f->>'do_not_contact')::boolean IS NOT TRUE AND EXISTS(SELECT 1 FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND id=contact_id AND do_not_contact_at IS NOT NULL) THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
   SELECT * INTO before_contact FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND id=contact_id AND company_id=target;
   before_safe:=before_safe||jsonb_build_object('contact_id',contact_id,'roles',before_contact.fields->'roles','do_not_contact',before_contact.fields->'do_not_contact','do_not_contact_at',before_contact.do_not_contact_at,'first_seen_at',before_contact.fields->'first_seen_at','last_verified_at',before_contact.fields->'last_verified_at','retention_review_at',before_contact.fields->'retention_review_at');
   email_value:=lower(btrim(f->>'email'));
   -- contacts.suppress is normative COM-07, NOT edit. Canonical B1 currently
   -- rejects this rule key: false until an independently approved capability
   -- mapping exists. No action enum, self-service rule or ALLOW grant is added.
   IF (f->>'do_not_contact')::boolean AND (op='CREATE_CONTACT' OR before_contact.do_not_contact_at IS NULL OR lower(btrim(before_contact.fields->>'email')) IS DISTINCT FROM email_value OR NOT EXISTS(SELECT 1 FROM app.crm_suppression WHERE tenant_id=c.tenant_id AND email=email_value))
   AND NOT EXISTS(SELECT 1 FROM auth_api.binding_authorization(NULL,'contacts.suppress',contact_id) a WHERE a.allowed)
   THEN RETURN identity_private.crm_denied(op,'POLICY_DENIED',corr);END IF;
   IF (f->>'do_not_contact')::boolean IS NOT TRUE AND EXISTS(SELECT 1 FROM app.crm_suppression WHERE tenant_id=c.tenant_id AND email=email_value) THEN RETURN identity_private.crm_denied(op,'INVALID_INPUT',corr);END IF;
   marked:=NULL;
   IF (f->>'do_not_contact')::boolean THEN
    INSERT INTO app.crm_suppression VALUES(c.tenant_id,email_value,clock_timestamp(),c.user_id) ON CONFLICT DO NOTHING;
    SELECT marked_at INTO marked FROM app.crm_suppression WHERE tenant_id=c.tenant_id AND email=email_value;
   END IF;
   IF op='CREATE_CONTACT' THEN
    INSERT INTO app.access_resources(tenant_id,id,kind,parent_id) VALUES(c.tenant_id,contact_id,'contacts',target);
    INSERT INTO app.crm_contacts VALUES(c.tenant_id,contact_id,target,f,marked);
   ELSE
    UPDATE app.crm_contacts SET fields=f,do_not_contact_at=marked WHERE tenant_id=c.tenant_id AND id=contact_id AND company_id=target;
   END IF;
  END IF;
  UPDATE app.crm_companies SET version=version+1 WHERE tenant_id=c.tenant_id AND id=target RETURNING version INTO v;
  after_safe:=jsonb_build_object('company_id',target,'contact_id',contact_id,'version',v::text,'relation',CASE WHEN op='EDIT_COMPANY' THEN f->'relation' ELSE NULL END,'roles',f->'roles','do_not_contact',f->'do_not_contact','do_not_contact_at',marked,'first_seen_at',f->'first_seen_at','last_verified_at',f->'last_verified_at','retention_review_at',f->'retention_review_at','changed_fields',CASE WHEN op='EDIT_COMPANY' THEN (SELECT jsonb_agg(k) FROM jsonb_object_keys(f) k WHERE f->k IS DISTINCT FROM jsonb_build_object('name',p.name,'city',p.city,'sector',p.sector,'relation',p.relation)->k) ELSE (SELECT jsonb_agg(k) FROM jsonb_object_keys(f) k WHERE f->k IS DISTINCT FROM before_contact.fields->k) END);
 END IF;
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','crm.change',target,'SUCCESS',corr,clock_timestamp(),
 jsonb_build_object('operation',op,'reason',payload->>'reason','before',before_safe,'after',after_safe));
 RETURN jsonb_build_object('id',target,'version',v::text);
END $fn$;

ALTER FUNCTION identity_private.crm_company_fields_valid(jsonb) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.crm_company_fields_valid(jsonb) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION identity_private.crm_contact_fields_valid(jsonb) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.crm_contact_fields_valid(jsonb) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION identity_private.crm_denied(text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.crm_denied(text,text,uuid) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION identity_private.crm_module_guard() OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.crm_company(uuid,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.crm_companies(text,boolean,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.crm_change(jsonb,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.crm_module_guard() FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
REVOKE ALL ON FUNCTION auth_api.crm_company(uuid,uuid),auth_api.crm_companies(text,boolean,uuid),auth_api.crm_change(jsonb,bytea,bytea,uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
-- PROPUESTO: these EXECUTE grants require exact approval; no user/role ALLOW grants.
GRANT EXECUTE ON FUNCTION auth_api.crm_company(uuid,uuid),auth_api.crm_companies(text,boolean,uuid),auth_api.crm_change(jsonb,bytea,bytea,uuid) TO cleanops_identity_service;
-- Additional INSERT access to the canonical resource catalogue is a review decision.
GRANT INSERT ON app.access_resources TO cleanops_auth_broker;
COMMIT;
