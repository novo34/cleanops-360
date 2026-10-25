-- REVIEW ONLY: requires separate exact owner authorization before any execution.
-- Reuses ONE evaluator: B1 effective_access delegates to the mechanically extracted body.
-- No new permission tables, roles, RLS policies, grants of business permissions, or mutation functions.
BEGIN;

CREATE FUNCTION identity_private.evaluate_user_access(subject uuid,action_name text,kind text,resource uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;result boolean;scope_ids uuid[];scope_kinds text[];cyclic boolean;
BEGIN
 c:=identity_private.context();
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=subject AND state='ACTIVE') THEN RETURN false;END IF;
 IF action_name IS NULL OR action_name NOT IN('view','create','edit','approve','delete','export','manage_permissions') OR kind IS NULL THEN RETURN false;END IF;
 PERFORM 1 FROM app.policy_versions WHERE tenant_id=c.tenant_id FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF resource IS NOT NULL THEN
  -- Resource identity/ancestry is server-owned, never a caller-provided tenant claim.
  IF NOT EXISTS(SELECT 1 FROM app.access_resources WHERE tenant_id=c.tenant_id AND id=resource AND (app.access_resources.kind=evaluate_user_access.kind OR (evaluate_user_access.kind='access' AND app.access_resources.kind='users'))) THEN RETURN false;END IF;
  WITH RECURSIVE lineage AS (
   SELECT n.id,n.kind,n.parent_id,ARRAY[n.id] AS path,false AS cycle FROM app.access_resources n WHERE n.tenant_id=c.tenant_id AND n.id=resource
   UNION ALL
   SELECT n.id,n.kind,n.parent_id,l.path||n.id,n.id=ANY(l.path) FROM lineage l JOIN app.access_resources n ON n.tenant_id=c.tenant_id AND n.id=l.parent_id WHERE NOT l.cycle
  ) SELECT array_agg(id),array_agg(CASE WHEN id=resource THEN evaluate_user_access.kind ELSE lineage.kind END),bool_or(cycle) INTO scope_ids,scope_kinds,cyclic FROM lineage;
  IF cyclic IS DISTINCT FROM false THEN RETURN false;END IF;
 ELSE scope_ids:=ARRAY[]::uuid[];scope_kinds:=ARRAY[kind];END IF;
 SELECT coalesce(bool_or(r.effect='ALLOW'),false) AND NOT coalesce(bool_or(r.effect='DENY'),false) INTO result
 FROM app.access_rules r WHERE r.tenant_id=c.tenant_id AND r.action=action_name
 AND (r.resource_kind='*' OR r.resource_kind=ANY(scope_kinds)) AND (r.resource_id IS NULL OR r.resource_id=ANY(scope_ids))
 AND r.revoked_at IS NULL AND r.start_at<=clock_timestamp() AND (r.expires_at IS NULL OR clock_timestamp()<r.expires_at)
 AND (r.user_id=subject OR EXISTS(SELECT 1 FROM app.access_role_memberships a JOIN app.access_roles v ON (v.tenant_id,v.id)=(a.tenant_id,a.role_id)
 WHERE a.tenant_id=c.tenant_id AND a.user_id=subject AND a.role_id=r.role_id AND v.revoked_at IS NULL AND a.revoked_at IS NULL AND a.start_at<=clock_timestamp() AND (a.expires_at IS NULL OR clock_timestamp()<a.expires_at)));
 RETURN coalesce(result,false);
END $fn$;

CREATE OR REPLACE FUNCTION auth_api.effective_access(action_name text,kind text,resource uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();
 RETURN identity_private.evaluate_user_access(c.user_id,action_name,kind,resource);
END $fn$;

CREATE FUNCTION auth_api.user_effective_access(target uuid,action_name text,kind text,resource uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context;
BEGIN
 c:=identity_private.context();
 IF NOT auth_api.effective_access('view','access',target)
 OR NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=target)
 THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 RETURN identity_private.evaluate_user_access(target,action_name,kind,resource);
END $fn$;

CREATE FUNCTION auth_api.assignable_role_catalogue(target uuid,after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE c identity_private.tx_context; result jsonb;
BEGIN
 c:=identity_private.context();
 IF NOT auth_api.effective_access('view','access',target)
 OR NOT EXISTS(SELECT 1 FROM app.users WHERE tenant_id=c.tenant_id AND id=target)
 THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF NOT auth_api.effective_access('manage_permissions','access',target)
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 WITH visible AS MATERIALIZED (
  SELECT r.id AS role_id,r.label,
   EXISTS(SELECT 1 FROM app.users u WHERE u.tenant_id=c.tenant_id AND u.id=target AND u.state='ACTIVE')
   AND NOT EXISTS(SELECT 1 FROM app.access_rules a WHERE a.tenant_id=c.tenant_id AND a.role_id=r.id
    AND a.revoked_at IS NULL AND a.effect='ALLOW'
    AND NOT auth_api.effective_access(a.action,a.resource_kind,a.resource_id)) AS assignable
  FROM app.access_roles r WHERE r.tenant_id=c.tenant_id AND r.revoked_at IS NULL AND (after_id IS NULL OR r.id>after_id)
  ORDER BY r.id LIMIT 21
 ), page AS MATERIALIZED(SELECT * FROM visible ORDER BY role_id LIMIT 20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.role_id) FROM page p),'[]'::jsonb),
  'next_after',CASE WHEN (SELECT count(*) FROM visible)>20 THEN (SELECT role_id FROM page ORDER BY role_id DESC LIMIT 1) ELSE NULL END)
 INTO result;
 IF octet_length(result::text)>identity_private.cfg('json_body_max') THEN RAISE EXCEPTION 'RESPONSE_LIMIT';END IF;
 RETURN result;
END $fn$;

ALTER FUNCTION identity_private.evaluate_user_access(uuid,text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION identity_private.evaluate_user_access(uuid,text,text,uuid) FROM PUBLIC,cleanops_runtime,cleanops_identity_service,cleanops_mail_worker;
ALTER FUNCTION auth_api.user_effective_access(uuid,text,text,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.user_effective_access(uuid,text,text,uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
GRANT EXECUTE ON FUNCTION auth_api.user_effective_access(uuid,text,text,uuid) TO cleanops_identity_service;
ALTER FUNCTION auth_api.assignable_role_catalogue(uuid,uuid) OWNER TO cleanops_auth_broker;
REVOKE ALL ON FUNCTION auth_api.assignable_role_catalogue(uuid,uuid) FROM PUBLIC,cleanops_runtime,cleanops_mail_worker;
GRANT EXECUTE ON FUNCTION auth_api.assignable_role_catalogue(uuid,uuid) TO cleanops_identity_service;
COMMIT;
