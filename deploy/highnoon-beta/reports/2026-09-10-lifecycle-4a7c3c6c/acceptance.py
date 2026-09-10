import subprocess,json,time
from pathlib import Path
sha='4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc'
root=Path('/srv/micnet/releases/highnoon')/sha
e=root/'evidence';e.mkdir(exist_ok=True)
src='/srv/micnet/releases/highnoon-build-4a7c3c6c'
def run(args,log=None):
 r=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if log:(e/log).write_text(r.stdout+r.stderr)
 if r.returncode:raise RuntimeError(str(args[:4])+': '+r.stderr[-1500:]+r.stdout[-1500:])
 return r.stdout
def inspect(name):
 d=json.loads(run(['docker','inspect',name]))[0]
 return {'image':d['Image'],'pid':d['State']['Pid'],'startedAt':d['State']['StartedAt'],'running':d['State']['Running'],'oomKilled':d['State']['OOMKilled'],'restartCount':d['RestartCount'],'ports':d['HostConfig']['PortBindings']}
app=run(['docker','image','inspect','highnoon-app:'+sha,'--format','{{.Id}}']).strip()
origin=run(['docker','image','inspect','highnoon-origin:'+sha,'--format','{{.Id}}']).strip()
common=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','128']
run(['docker','run','--rm','--network','none',*common,'--memory','256m','--tmpfs','/tmp:rw,size=32m','--mount','type=bind,src='+src+'/vnext/test,dst=/app/vnext/test,readonly','--mount','type=bind,src='+src+'/vnext/test-support,dst=/app/vnext/test-support,readonly',app,'node','--test','vnext/test/ws-security.test.js','vnext/test/ws-lifecycle.test.js'],'image-security-tests.log')
net='highnoon-lifecycle-4a-test';an='highnoon-lifecycle-4a-app';on='highnoon-lifecycle-4a-origin'
betaBefore={n:inspect(n) for n in ['highnoon-beta-app-1','highnoon-beta-origin-1']}
for directory in ['data','backups','output']:
 p=root/'scratch'/directory;p.mkdir(parents=True,exist_ok=False);p.chmod(0o755);__import__('os').chown(p,1000,1000)
run(['docker','network','create','--internal',net])
try:
 cmd=['docker','run','-d','--name',an,'--network',net,'--network-alias','app','--restart','no',*common,'--cpus','.85','--memory','896m','--memory-swap','896m','--tmpfs','/tmp:rw,noexec,nosuid,size=32m,uid=1000,gid=1000,mode=1770','-e','PUBLIC_URL=https://solitairehighnoon-test.stillorbit.net','-e','NODE_OPTIONS=--max-old-space-size=640']
 for a,b in [('data','/data'),('backups','/backups'),('output','/evidence')]:cmd+=['--mount','type=bind,src='+str(root/'scratch'/a)+',dst='+b]
 cmd+=['--mount','type=bind,src=/tmp/highnoon-7f-regression.cjs,dst=/app/regression.cjs,readonly',app];run(cmd)
 run(['docker','run','-d','--name',on,'--network',net,'--network-alias','candidate-origin','--restart','no',*common,'--cpus','.15','--memory','128m','--memory-swap','128m','--tmpfs','/tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=1770',origin])
 for i in range(30):
  h=subprocess.run(['docker','exec',on,'wget','-q','-O','/dev/null','http://127.0.0.1:8080/health'],capture_output=True)
  if h.returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('scratch health timeout')
 before=inspect(an)
 probe=json.loads(run(['docker','run','--rm','--network',net,*common,'--cpus','.5','--memory','128m','--mount','type=bind,src=/tmp/highnoon-lifecycle-image-probe.cjs,dst=/app/probe.cjs,readonly',app,'node','probe.cjs'],'image-probe.log'))
 after=inspect(an);assert before==after and after['running'] and after['restartCount']==0 and not after['oomKilled']
 (e/'image-probe.json').write_text(json.dumps({'probe':probe,'before':before,'after':after,'sameProcess':True},indent=2))
 run(['docker','exec','-e','SKIP_FRAGMENT=1',an,'node','regression.cjs'],'normal-regression.log')
 normal=json.loads((root/'scratch/output/normal-regression.json').read_text());normal['history']=[{'seat':h['seat'],'won':h['won']} for h in normal['history']]
 (e/'normal-regression.json').write_text(json.dumps(normal,indent=2))
 final=inspect(an);assert final==before
 (e/'process-verification.json').write_text(json.dumps({'before':before,'afterAllRegression':final,'sameProcess':True},indent=2))
finally:
 for n in [an,on]:
  r=subprocess.run(['docker','logs',n],text=True,capture_output=True);(e/(n+'.log')).write_text(r.stdout+r.stderr)
  subprocess.run(['docker','rm','-f',n],check=True,stdout=subprocess.PIPE)
 run(['docker','network','rm',net])
 afterBeta={n:inspect(n) for n in betaBefore};assert afterBeta==betaBefore
 (e/'beta-unchanged.json').write_text(json.dumps({'before':betaBefore,'after':afterBeta},indent=2))
run(['python3','/tmp/highnoon-lifecycle-scan.py'],'scan.log')
print('PASS: image security tests, proxy lifecycle probes, unchanged PID, normal regression, cleanup, beta unchanged, scans completed')
