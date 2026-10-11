#!/usr/bin/env python3
"""Execute the real Bash setup/check script against fake gcloud/curl commands.

No Google API request, credential lookup or IAM mutation is performed by tests.
Run: python3 firebase-share-backend/scripts/tests/test_hall_ar_provisioning.py
"""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'provision-hall-ar-storage.sh'
PROJECT = 'configurator-360'
NUMBER = '719238533149'
BUCKET = PROJECT + '-hall-ar'
RUNTIME = 'configurator-runtime@' + PROJECT + '.iam.gserviceaccount.com'
DEPLOYER = 'github-deployer@' + PROJECT + '.iam.gserviceaccount.com'
APIS = ['storage.googleapis.com', 'firebasestorage.googleapis.com', 'cloudscheduler.googleapis.com']
LIFECYCLE = {'rule': [{'action': {'type': 'Delete'}, 'condition': {'age': 2, 'matchesPrefix': ['hall-ar/']}}]}

FAKE = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
kind = Path(sys.argv[0]).name
args = sys.argv[1:]
state_file = Path(os.environ['MOCK_CLOUD_STATE'])
s = json.loads(state_file.read_text())
with open(os.environ['MOCK_CLOUD_CALLS'], 'a') as out:
    out.write(json.dumps([kind, args]) + '\n')
def save(): state_file.write_text(json.dumps(s))
def die(message): print(message, file=sys.stderr); sys.exit(1)
def opt(name):
    if name in args: return args[args.index(name)+1]
    return next((a.split('=', 1)[1] for a in args if a.startswith(name+'=')), None)
def binding(target):
    item = {'role': opt('--role'), 'members': [opt('--member')]}
    if item not in target: target.append(item)
if kind == 'gcloud':
    if args[:2] == ['projects','describe']: print(s.get('number', '719238533149'))
    elif args[:2] == ['auth','list']: print(s.get('actor', 'project-admin@example.test'))
    elif args[:2] == ['services','list']: print('\n'.join(s['apis']))
    elif args[:2] == ['services','enable']:
        if s.get('deny_enable'): die('PERMISSION_DENIED: serviceusage.services.enable')
        s['apis'] = sorted(set(s['apis'] + [a for a in args[2:] if not a.startswith('-')]))
    elif args[:2] == ['auth','print-access-token']: print('MOCK_SECRET_ACCESS_TOKEN')
    elif args[:3] == ['storage','buckets','create']:
        if s.get('bucket'): die('Bucket already exists')
        s['bucket']={'name':'configurator-360-hall-ar','projectNumber':'719238533149', 'location':'EUROPE-WEST1',
                     'iamConfiguration':{'uniformBucketLevelAccess':{'enabled':True},'publicAccessPrevention':'enforced'}}
    elif args[:3] == ['storage','buckets','update']:
        if not s.get('bucket'): die('No bucket')
        s['bucket']['iamConfiguration']={'uniformBucketLevelAccess':{'enabled':True},'publicAccessPrevention':'enforced'}
        s['bucket']['softDeletePolicy']={'retentionDurationSeconds':'0'}
        s['bucket']['lifecycle']=json.loads(Path(opt('--lifecycle-file')).read_text())
    elif args[:3] == ['storage','buckets','add-iam-policy-binding']: binding(s['iam']['bindings'])
    elif args[:3] == ['iam','service-accounts','describe']: print(args[3])
    elif args[:3] == ['iam','service-accounts','add-iam-policy-binding']:
        binding(s.setdefault('sa_bindings', {}).setdefault(args[3], []))
    elif args[:3] == ['iam','roles','list']: print('\n'.join('projects/configurator-360/roles/'+v for v in s['roles']))
    elif args[:3] == ['iam','roles','describe']: print(json.dumps(s['roles'][args[3]]))
    elif args[:3] == ['iam','roles','create']:
        if args[3] in s['roles']: die('Role already exists')
        s['roles'][args[3]]=json.loads(Path(opt('--file')).read_text())
    elif args[:2] == ['projects','add-iam-policy-binding']: binding(s.setdefault('project_bindings', []))
    else: die('Unexpected gcloud command: '+repr(args))
    save()
elif kind == 'curl':
    method = opt('--request')
    url = args[-1]
    assert opt('--header').startswith('@')
    assert 'MOCK_SECRET_ACCESS_TOKEN' in Path(opt('--header')[1:]).read_text()
    status, body = 200, {}
    if url.startswith('https://storage.googleapis.com/'):
        if url.endswith('/iam'):
            status = s.get('iam_status', 200); body=s['iam']
        else:
            status=s.get('bucket_status', 200 if s.get('bucket') else 404)
            body=s.get('bucket') or {'error':{'message':'Bucket not found'}}
    elif url.startswith('https://firebasestorage.googleapis.com/'):
        status=s.get('firebase_status', 200 if s.get('registered') else 404)
        if method == 'POST':
            assert url.endswith(':addFirebase')
            s['registered']=True; status=200
        if s.get('registered'): body={'name':s.get('firebase_name','projects/719238533149/buckets/configurator-360-hall-ar')}
        else: body={'error':{'message':'Bucket not registered'}}
    else: die('Unexpected HTTP URL: '+url)
    if status not in (200,404): body={'error':{'message':'Simulated API failure', 'code':status}}
    Path(opt('--output')).write_text(json.dumps(body))
    save(); print(status, end='')
else: die('Unexpected binary')
'''

def ready_state():
    return {
        'apis': APIS.copy(), 'registered': True, 'roles': {},
        'bucket': {'name': BUCKET, 'projectNumber': NUMBER, 'location': 'EUROPE-WEST1',
                   'iamConfiguration': {'uniformBucketLevelAccess': {'enabled': True}, 'publicAccessPrevention': 'enforced'},
                   'softDeletePolicy': {'retentionDurationSeconds': '0'}, 'lifecycle': copy.deepcopy(LIFECYCLE)},
        'iam': {'bindings': [{'role': 'roles/storage.objectAdmin', 'members': ['serviceAccount:' + RUNTIME]}]},
    }

def writes(calls):
    result = []
    for kind, args in calls:
        if kind == 'curl':
            if args[args.index('--request') + 1] != 'GET': result.append((kind,args))
        elif any(part in args for part in ['enable','create','update','delete','add-iam-policy-binding']):
            result.append((kind,args))
    return result

class ProvisioningTests(unittest.TestCase):
    def run_script(self, state=None, mode='--check', overrides=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binpath = root / 'bin'; binpath.mkdir()
            for name in ('gcloud','curl'):
                path=binpath/name; path.write_text(FAKE); path.chmod(0o700)
            state_file=root/'state.json'; state_file.write_text(json.dumps(state if state is not None else ready_state()))
            log=root/'calls.jsonl'; log.touch()
            env=os.environ.copy()
            env.update({'PATH':str(binpath)+os.pathsep+env['PATH'], 'MOCK_CLOUD_STATE':str(state_file),
                        'MOCK_CLOUD_CALLS':str(log), 'GITHUB_ACTIONS':'false','GCP_PROJECT_ID':PROJECT,'HALL_AR_DEPLOYER':DEPLOYER})
            env.update(overrides or {})
            result=subprocess.run(['bash',str(SCRIPT)]+([mode] if mode else []),env=env,text=True,capture_output=True,timeout=60)
            calls=[json.loads(line) for line in log.read_text().splitlines()]
            self.assertNotIn('MOCK_SECRET_ACCESS_TOKEN', result.stdout+result.stderr)
            for kind, args in calls:
                if kind == 'curl':
                    header=Path(args[args.index('--header')+1][1:])
                    self.assertFalse(header.exists(), 'Temporary authentication header must be removed')
            return result, calls, json.loads(state_file.read_text())

    def test_default_and_explicit_check_are_read_only(self):
        for mode in (None,'--check'):
            with self.subTest(mode=mode):
                result,calls,state=self.run_script(mode=mode)
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertIn('infrastructure verified (read only)',result.stdout)
                self.assertEqual(writes(calls),[])
                self.assertEqual(state,ready_state())

    def test_missing_api_stops_check_without_enabling(self):
        state=ready_state(); state['apis'].remove('cloudscheduler.googleapis.com')
        result,calls,_=self.run_script(state)
        self.assertNotEqual(result.returncode,0); self.assertIn('cloudscheduler.googleapis.com',result.stderr)
        self.assertIn('--setup',result.stderr); self.assertEqual(writes(calls),[])

    def test_missing_bucket_stops_check_without_create(self):
        state=ready_state(); state['bucket']=None
        result,calls,_=self.run_script(state)
        self.assertNotEqual(result.returncode,0); self.assertIn('bucket is not set up',result.stderr)
        self.assertEqual(writes(calls),[])

    def test_forbidden_bucket_is_not_treated_as_missing_even_in_setup(self):
        state=ready_state(); state['bucket_status']=403
        result,calls,_=self.run_script(state,'--setup')
        self.assertNotEqual(result.returncode,0); self.assertIn('HTTP 403',result.stderr)
        self.assertEqual(writes(calls),[])

    def test_missing_firebase_registration_stops_check(self):
        state=ready_state(); state['registered']=False
        result,calls,_=self.run_script(state)
        self.assertNotEqual(result.returncode,0); self.assertIn('not registered',result.stderr)
        self.assertEqual(writes(calls),[])

    def test_forbidden_firebase_is_not_registered_automatically(self):
        state=ready_state(); state['firebase_status']=403
        result,calls,_=self.run_script(state)
        self.assertNotEqual(result.returncode,0); self.assertIn('HTTP 403',result.stderr)
        self.assertEqual(writes(calls),[])

    def test_private_bucket_contract(self):
        for change,match in [
            (lambda s:s['bucket']['iamConfiguration'].update(publicAccessPrevention='inherited'),'Public access prevention'),
            (lambda s:s['bucket']['iamConfiguration']['uniformBucketLevelAccess'].update(enabled=False),'Uniform'),
            (lambda s:s['bucket'].update(softDeletePolicy={'retentionDurationSeconds':'604800'}),'Soft deletion'),
            (lambda s:s['bucket'].update(lifecycle={'rule':[]}),'orphan-cleanup'),
            (lambda s:s['iam'].update(bindings=[]),'runtime bucket binding'),
            (lambda s:s['iam']['bindings'].append({'role':'roles/storage.objectViewer','members':['allUsers']}),'public IAM'),
        ]:
            state=ready_state(); change(state)
            with self.subTest(message=match):
                result,calls,_=self.run_script(state)
                self.assertNotEqual(result.returncode,0); self.assertIn(match,result.stderr)
                self.assertEqual(writes(calls),[])

    def test_ownership_location_and_retention_guards(self):
        for change,match in [
            (lambda s:s['bucket'].update(projectNumber='1234567'),'identity/project'),
            (lambda s:s['bucket'].update(location='US'),'europe-west1'),
            (lambda s:s['bucket'].update(retentionPolicy={'retentionPeriod':'86400'}),'retention policy'),
            (lambda s:s['bucket'].update(versioning={'enabled':True}),'hold/versioning'),
        ]:
            state=ready_state(); change(state)
            with self.subTest(message=match):
                result,calls,_=self.run_script(state,'--setup')
                self.assertNotEqual(result.returncode,0); self.assertIn(match,result.stderr)
                self.assertEqual(writes(calls),[])

    def test_setup_creates_only_dedicated_resources_and_is_rerunnable(self):
        state=ready_state(); state.update(apis=['storage.googleapis.com'],bucket=None,registered=False,iam={'bindings':[]})
        result,calls,state=self.run_script(state,'--setup')
        self.assertEqual(result.returncode,0,result.stderr); self.assertIn('setup complete',result.stdout)
        enabled=[args for kind,args in calls if kind=='gcloud' and args[:2]==['services','enable']]
        self.assertEqual(len(enabled),1); self.assertNotIn('storage.googleapis.com',enabled[0])
        self.assertTrue(state['registered']); self.assertEqual(state['bucket']['lifecycle'],LIFECYCLE)
        self.assertEqual(set(state['roles']['hallArBucketInspector']['includedPermissions']),{'storage.buckets.get','storage.buckets.getIamPolicy'})
        project_perms=set(state['roles']['hallArDeploymentPrerequisites']['includedPermissions'])
        self.assertIn('cloudscheduler.jobs.create',project_perms)
        for forbidden in ['serviceusage.services.enable','storage.buckets.create','storage.buckets.setIamPolicy','storage.objects.get']:
            self.assertNotIn(forbidden,project_perms)
        self.assertNotIn('roles/owner',json.dumps(calls)); self.assertNotIn('roles/editor',json.dumps(calls))
        for kind,args in calls:
            if kind=='gcloud' and args[:2]==['storage','buckets']:
                self.assertIn('gs://'+BUCKET,args)
        result,calls,_=self.run_script(state,'--setup')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any('enable' in args or 'create' in args for kind,args in calls if kind=='gcloud'))
        self.assertFalse(any(kind=='curl' and 'POST' in args for kind,args in calls))
        result,calls,_=self.run_script(state)
        self.assertEqual(result.returncode,0,result.stderr); self.assertEqual(writes(calls),[])

    def test_enable_denial_stops_before_bucket_changes(self):
        state=ready_state(); state.update(apis=[],deny_enable=True)
        result,calls,_=self.run_script(state,'--setup')
        self.assertNotEqual(result.returncode,0); self.assertIn('serviceusage.services.enable',result.stderr)
        self.assertFalse(any(kind=='curl' or args[:2]==['storage','buckets'] for kind,args in calls))

    def test_existing_custom_role_is_not_overwritten(self):
        state=ready_state();state['roles']['hallArBucketInspector']={'stage':'GA','includedPermissions':['storage.objects.get']}
        result,calls,_=self.run_script(state,'--setup')
        self.assertNotEqual(result.returncode,0);self.assertIn('will not overwrite',result.stderr)
        self.assertFalse(any(kind=='gcloud' and args[:3]==['iam','roles','update'] for kind,args in calls))

    def test_setup_is_blocked_in_ci_and_for_deployer(self):
        result,calls,_=self.run_script(mode='--setup',overrides={'GITHUB_ACTIONS':'true'})
        self.assertNotEqual(result.returncode,0);self.assertIn('Do not run --setup',result.stderr);self.assertEqual(calls,[])
        state=ready_state();state['actor']=DEPLOYER
        result,calls,_=self.run_script(state,'--setup')
        self.assertNotEqual(result.returncode,0);self.assertIn('administrator',result.stderr);self.assertEqual(writes(calls),[])

    def test_invalid_mode_project_and_principal(self):
        for mode,override in [('--oops',{}),('--setup',{'GCP_PROJECT_ID':'someone-else'}),
                              ('--setup',{'HALL_AR_DEPLOYER':'a@example.com'}),('--setup',{'HALL_AR_DEPLOYER':RUNTIME})]:
            with self.subTest(mode=mode,override=override):
                result,calls,_=self.run_script(mode=mode,overrides=override)
                self.assertNotEqual(result.returncode,0);self.assertEqual(calls,[])

    def test_workflow_checks_and_preserves_deployment_targets(self):
        repo=SCRIPT.parents[2]
        workflow=(repo/'.github/workflows/deploy-firebase-share.yml').read_text()
        self.assertIn('run: bash firebase-share-backend/scripts/provision-hall-ar-storage.sh --check',workflow)
        self.assertNotIn('run: bash firebase-share-backend/scripts/provision-hall-ar-storage.sh --setup',workflow)
        for target in ['storage:hall-ar','functions:publishHallAR','functions:getHallAR','functions:cleanupHallAR','functions:requestBookshelfQuotation']:
            self.assertIn(target,workflow)

if __name__ == '__main__':
    unittest.main(verbosity=2)
