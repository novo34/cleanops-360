-- PROPUESTO / REVIEW ONLY. Not a migration. Never auto-installed.
-- Requires exact owner approval of these bytes, ACL, dependencies and isolated trial.
-- Product activation remains DENIED pending organization/feature_flags linkage.
BEGIN;
CREATE TABLE app.crm_companies (
 tenant_id uuid NOT NULL REFERENCES app.organizations(id), id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 city text NOT NULL CHECK(length(btrim(city)) BETWEEN 1 AND 120),
 sector text NOT NULL CHECK(length(btrim(sector)) BETWEEN 1 AND 120),
 relation text NOT NULL CHECK(relation IN('Prospecto','Cliente')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9999999999999999),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,id) REFERENCES app.access_resources(tenant_id,id)
);
CREATE TABLE app.crm_contacts (
 tenant_id uuid NOT NULL, id uuid NOT NULL, company_id uuid NOT NULL,
 fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='object'),
 do_not_contact_at timestamptz,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,company_id) REFERENCES app.crm_companies(tenant_id,id),
 CHECK(fields ?& ARRAY['name','email','roles','data_source','source_url','first_seen_at','last_verified_at','communication_basis','do_not_contact','privacy_request_status','retention_review_at']),
 CHECK(length(btrim(fields->>'name')) BETWEEN 1 AND 160),
 CHECK(length(fields->>'email') BETWEEN 3 AND 254 AND fields->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 CHECK(length(btrim(fields->>'data_source')) BETWEEN 1 AND 200),
 CHECK(jsonb_typeof(fields->'roles')='array' AND jsonb_array_length(fields->'roles') BETWEEN 1 AND 8),
 CHECK(fields->'roles' <@ '["Bauleiter","Projektleiter","Facility Manager","Objektleiter","Einkauf","Baumanagement","administración","dirección"]'::jsonb),
 CHECK(jsonb_typeof(fields->'do_not_contact')='boolean'),
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

CREATE FUNCTION auth_api.crm_company(target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; result jsonb;
BEGIN
 c:=identity_private.context(); PERFORM identity_private.crm_module_guard();
 IF NOT auth_api.effective_access('view','companies',target) THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'sector',p.sector,'relation',p.relation,'version',p.version::text,
 'can_edit',auth_api.effective_access('edit','companies',p.id),
 'contacts',coalesce((SELECT jsonb_agg(x.fields||jsonb_build_object('id',x.id,'do_not_contact',x.do_not_contact_at IS NOT NULL OR EXISTS(SELECT 1 FROM app.crm_suppression s WHERE s.tenant_id=c.tenant_id AND s.email=lower(btrim(x.fields->>'email'))),'do_not_contact_at',coalesce(x.do_not_contact_at,(SELECT s.marked_at FROM app.crm_suppression s WHERE s.tenant_id=c.tenant_id AND s.email=lower(btrim(x.fields->>'email'))))) ORDER BY x.id)
 FROM app.crm_contacts x WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND auth_api.effective_access('view','contacts',x.id)),'[]'::jsonb))
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
 IF search_text IS NULL OR length(search_text)>120 OR clients_only IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF NOT auth_api.effective_access('view','companies',NULL) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 WITH visible AS MATERIALIZED (
  SELECT p.id FROM app.crm_companies p WHERE p.tenant_id=c.tenant_id AND (after_id IS NULL OR p.id>after_id)
  AND (NOT clients_only OR p.relation='Cliente') AND auth_api.effective_access('view','companies',p.id)
  AND (strpos(lower(p.name),lower(search_text))>0 OR EXISTS(SELECT 1 FROM app.crm_contacts x
   WHERE x.tenant_id=c.tenant_id AND x.company_id=p.id AND auth_api.effective_access('view','contacts',x.id)
   AND (strpos(lower(x.fields->>'name'),lower(search_text))>0 OR strpos(lower(x.fields->>'email'),lower(search_text))>0)))
  ORDER BY p.id LIMIT 26
 ),page AS MATERIALIZED(SELECT id FROM visible ORDER BY id LIMIT 25)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(auth_api.crm_company(id) ORDER BY id) FROM page),'[]'::jsonb),
 'next_after',CASE WHEN (SELECT count(*) FROM visible)>25 THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 IF octet_length(result::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT';END IF;
 RETURN result;
END $fn$;

CREATE FUNCTION auth_api.crm_change(payload jsonb,key_hash bytea,request_hash bytea,corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; p app.crm_companies; before_safe jsonb; after_safe jsonb;
 op text;target uuid;contact_id uuid;f jsonb;email_value text;marked timestamptz;v bigint;
BEGIN
 c:=identity_private.context();PERFORM identity_private.crm_module_guard();
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR corr IS NULL OR octet_length(key_hash)<>32 OR octet_length(request_hash)<>32 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 PERFORM 1 FROM app.idempotency_records r WHERE r.tenant_id=c.tenant_id AND r.user_id=c.user_id AND r.operation='changeCrmRecord'
 AND r.key_digest=key_hash AND r.request_digest=request_hash AND r.state='PENDING' AND r.one_time_result
 AND r.owner_backend=pg_backend_pid() AND r.owner_xid=pg_current_xact_id() AND r.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_OWNED';END IF;
 op:=payload->>'operation';
 IF op NOT IN('CREATE_COMPANY','EDIT_COMPANY','CREATE_CONTACT','EDIT_CONTACT') OR op IS NULL THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
 IF op='CREATE_COMPANY' THEN
  IF NOT auth_api.effective_access('create','companies',NULL) THEN RETURN jsonb_build_object('error','POLICY_DENIED');END IF;
  target:=gen_random_uuid();f:=payload->'company';
  INSERT INTO app.access_resources(tenant_id,id,kind) VALUES(c.tenant_id,target,'companies');
  INSERT INTO app.crm_companies(tenant_id,id,name,city,sector,relation) VALUES(c.tenant_id,target,f->>'name',f->>'city',f->>'sector',f->>'relation') RETURNING version INTO v;
  before_safe:=NULL;after_safe:=jsonb_build_object('company_id',target,'version',v::text);
 ELSE
  target:=(payload->>'company_id')::uuid;
  IF NOT auth_api.effective_access('view','companies',target) THEN RETURN jsonb_build_object('error','NOT_FOUND');END IF;
  SELECT * INTO p FROM app.crm_companies WHERE tenant_id=c.tenant_id AND id=target FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND');END IF;
  IF NOT auth_api.effective_access('edit','companies',target) THEN RETURN jsonb_build_object('error','POLICY_DENIED');END IF;
  IF p.version::text IS DISTINCT FROM payload->>'expected_version' THEN RETURN jsonb_build_object('error','CRM_CONFLICT');END IF;
  IF length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 500 OR payload->>'reason' IS NULL THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
  before_safe:=jsonb_build_object('company_id',target,'version',p.version::text);
  IF op='EDIT_COMPANY' THEN
   f:=payload->'company';
   UPDATE app.crm_companies SET name=f->>'name',city=f->>'city',sector=f->>'sector',relation=f->>'relation' WHERE tenant_id=c.tenant_id AND id=target;
  ELSE
   f:=payload->'contact';contact_id:=CASE WHEN op='CREATE_CONTACT' THEN gen_random_uuid() ELSE (payload->>'contact_id')::uuid END;
   IF NOT auth_api.effective_access(CASE WHEN op='CREATE_CONTACT' THEN 'create' ELSE 'edit' END,'contacts',CASE WHEN op='CREATE_CONTACT' THEN NULL ELSE contact_id END) THEN RETURN jsonb_build_object('error','POLICY_DENIED');END IF;
   IF op='EDIT_CONTACT' AND NOT EXISTS(SELECT 1 FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND id=contact_id AND company_id=target) THEN RETURN jsonb_build_object('error','NOT_FOUND');END IF;
   IF op='CREATE_CONTACT' AND (SELECT count(*) FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND company_id=target)>=100 THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
   IF op='EDIT_CONTACT' AND (f->>'do_not_contact')::boolean IS NOT TRUE AND EXISTS(SELECT 1 FROM app.crm_contacts WHERE tenant_id=c.tenant_id AND id=contact_id AND do_not_contact_at IS NOT NULL) THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
   email_value:=lower(btrim(f->>'email'));
   IF (f->>'do_not_contact')::boolean IS NOT TRUE AND EXISTS(SELECT 1 FROM app.crm_suppression WHERE tenant_id=c.tenant_id AND email=email_value) THEN RETURN jsonb_build_object('error','INVALID_INPUT');END IF;
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
  after_safe:=jsonb_build_object('company_id',target,'contact_id',contact_id,'version',v::text,'do_not_contact',f->'do_not_contact');
 END IF;
 INSERT INTO app.audit_logs(tenant_id,id,actor_user_id,actor_kind,action,resource_id,outcome,correlation_id,occurred_at,safe_metadata)
 VALUES(c.tenant_id,gen_random_uuid(),c.user_id,'USER','crm.change',target,'SUCCESS',corr,clock_timestamp(),
 jsonb_build_object('operation',op,'reason',payload->>'reason','before',before_safe,'after',after_safe));
 RETURN jsonb_build_object('id',target,'version',v::text);
END $fn$;

ALTER FUNCTION identity_private.crm_module_guard() OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.crm_company(uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.crm_companies(text,boolean,uuid) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.crm_change(jsonb,bytea,bytea,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.crm_module_guard() FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
REVOKE ALL ON FUNCTION auth_api.crm_company(uuid),auth_api.crm_companies(text,boolean,uuid),auth_api.crm_change(jsonb,bytea,bytea,uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
-- PROPUESTO: these EXECUTE grants require exact approval; no user/role ALLOW grants.
GRANT EXECUTE ON FUNCTION auth_api.crm_company(uuid),auth_api.crm_companies(text,boolean,uuid),auth_api.crm_change(jsonb,bytea,bytea,uuid) TO cleanops_identity_service;
-- Additional INSERT access to the canonical resource catalogue is a review decision.
GRANT INSERT ON app.access_resources TO cleanops_auth_broker;
COMMIT;
