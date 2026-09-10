#!/usr/bin/python3
import json,os,signal,subprocess,time
from pathlib import Path
name='highnoon-restore-app'
def inspect(): return json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
before=inspect()
assert before['Name']=='/'+name
assert before['Image']=='sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553'
assert before['HostConfig']['RestartPolicy']['Name']=='unless-stopped'
assert all('highnoon-beta/sqlite' not in m.get('Source','') for m in before['Mounts'])
started=time.monotonic();os.kill(before['State']['Pid'],signal.SIGKILL)
health=None
current=before
for _ in range(60):
    current=inspect()
    if current['State']['Running'] and current['RestartCount']>before['RestartCount']:
        p=subprocess.run(['docker','exec',name,'node','-e',"fetch('http://127.0.0.1:3011/health').then(async r=>{console.log(await r.text());if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],capture_output=True,text=True)
        if p.returncode==0:health=json.loads(p.stdout);break
    time.sleep(.5)
assert health and health['profileDatabase']=='ok'
result={'status':'PASS','scope':'Isolated NAS-restored scratch container, same app image and restart policy','trigger':'SIGKILL to verified host PID; NOT docker kill; no manual docker start','restartCountBefore':before['RestartCount'],'restartCountAfter':current['RestartCount'],'health':health,'recoverySeconds':round(time.monotonic()-started,3),'expectedLimitation':'Active matches/lobbies are memory-only and vanish; persisted profiles/history remain'}
Path('/srv/micnet/releases/highnoon-acceptance-evidence/automatic-recovery.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
