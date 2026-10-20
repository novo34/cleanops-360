-- REVIEW ONLY. Do not run, including in CI, before specific owner authorization.
-- Base: B1 SQL14. No table, role, policy, seed, or existing function is changed.
BEGIN;

CREATE FUNCTION auth_api.administration_users(search_text text, state_filter text, after_id uuid, page_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; result jsonb;
BEGIN
 c := identity_private.context();
 IF search_text IS NULL OR length(search_text)>120 OR page_size IS NULL OR page_size NOT BETWEEN 1 AND 50
 OR (state_filter IS NOT NULL AND state_filter NOT IN ('ACTIVE','DISABLED')) THEN
  RAISE EXCEPTION 'AUTH_INVALID' USING ERRCODE='42501';
 END IF;
 -- Check authorization independently of search/pagination. A scoped grant can
 -- discover only its authorized users; a resource DENY also filters global grants.
 IF NOT auth_api.effective_access('view','users',NULL) AND NOT EXISTS (
  SELECT 1 FROM app.users u WHERE u.tenant_id=c.tenant_id AND auth_api.effective_access('view','users',u.id)
 ) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 WITH visible AS MATERIALIZED (
  SELECT u.id,u.display_name,u.state,u.risk_class,u.created_at
  FROM app.users u
  WHERE u.tenant_id=c.tenant_id AND (after_id IS NULL OR u.id>after_id)
  AND (state_filter IS NULL OR u.state=state_filter)
  AND strpos(lower(u.display_name),lower(search_text))>0
  AND auth_api.effective_access('view','users',u.id)
  ORDER BY u.id LIMIT page_size+1
 ), page AS MATERIALIZED (SELECT * FROM visible ORDER BY id LIMIT page_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM page p),'[]'::jsonb),
  'next_after',CASE WHEN (SELECT count(*) FROM visible)>page_size THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END)
 INTO result;
 IF octet_length(result::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT'; END IF;
 RETURN result;
END $fn$;

CREATE FUNCTION auth_api.administration_user(target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; result jsonb;
BEGIN
 c := identity_private.context();
 -- Missing, denied and foreign targets share the same result, without existence leaks.
 IF target IS NULL OR NOT auth_api.effective_access('view','users',target) THEN
  RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 SELECT jsonb_build_object('user',jsonb_build_object('id',u.id,'display_name',u.display_name,
  'state',u.state,'risk_class',u.risk_class,'created_at',u.created_at),
  'organization',jsonb_build_object('id',o.id,'name',o.name)) INTO result
 FROM app.users u JOIN app.organizations o ON o.id=u.tenant_id
 WHERE u.tenant_id=c.tenant_id AND u.id=target;
 IF result IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $fn$;

ALTER FUNCTION auth_api.administration_users(text,text,uuid,integer) OWNER TO cleanops_auth_broker;
ALTER FUNCTION auth_api.administration_user(uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.administration_users(text,text,uuid,integer) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
REVOKE ALL ON FUNCTION auth_api.administration_user(uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
GRANT EXECUTE ON FUNCTION auth_api.administration_users(text,text,uuid,integer) TO cleanops_identity_service;
GRANT EXECUTE ON FUNCTION auth_api.administration_user(uuid) TO cleanops_identity_service;
COMMIT;
