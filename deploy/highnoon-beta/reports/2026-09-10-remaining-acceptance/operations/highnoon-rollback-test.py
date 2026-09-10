#!/usr/bin/python3
import json,subprocess,time
from pathlib import Path
name='highnoon-restore-app'
current='sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553'
old='sha256:b73faa2f6b5d99efb3c6e690ddbd341621a569ed9f80ca478a9e8efc1bfb251a'
root=json.loads(Path('/srv/micnet/releases/highnoon-acceptance-evidence/nas-restore-result.json').read_text())['scratchRoot']
def run(a):return subprocess.check_output(a,text=True).strip()
results=[]
for label,image in [('rollback',old),('upgrade-return',current)]:
    info=json.loads(run(['docker','inspect',name]))[0]
    assert info['Name']=='/'+name and info['Image'] in [current,old]
    assert all('highnoon-beta/sqlite' not in m.get('Source','') for m in info['Mounts'])
    t=time.monotonic();run(['docker','stop','--time','30',name]);run(['docker','rm',name])
    run(['docker','run','-d','--name',name,'--network','highnoon-restore-uat','--network-alias','app','--restart','unless-stopped','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','896m','--cpus','.85','--pids-limit','128','--tmpfs','/tmp:rw,noexec,nosuid,size=32m,uid=1000,gid=1000','-v',root+'/data:/data','-e','HOST=0.0.0.0','-e','PORT=3011','-e','VNEXT_PROFILE_DATABASE=/data/highnoon.sqlite',image])
    health=None
    for _ in range(30):
        p=subprocess.run(['docker','exec',name,'node','-e',"fetch('http://127.0.0.1:3011/health').then(async r=>{console.log(await r.text());if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],capture_output=True,text=True)
        if p.returncode==0:health=json.loads(p.stdout);break
        time.sleep(.5)
    assert health and health['profileDatabase']=='ok'
    # Read only counts, never session-token columns.
    profiles=json.loads(run(['docker','exec',name,'node','-e',"const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/highnoon.sqlite',{readOnly:true});console.log(JSON.stringify({players:d.prepare('select count(*) n from players').get().n,results:d.prepare('select count(*) n from match_results').get().n,playerResults:d.prepare('select count(*) n from match_player_results').get().n}));d.close()" ]))
    assert profiles=={'players':3,'results':1,'playerResults':2}
    results.append({'step':label,'image':image,'health':health,'profileCounts':profiles,'seconds':round(time.monotonic()-t,3)})
out={'status':'PASS','scope':'App-only scratch switch between retained candidates, schema v2 in both; no schema migration tested; old broken Nginx intentionally NOT used','steps':results,'liveBetaTouched':False}
Path('/srv/micnet/releases/highnoon-acceptance-evidence/rollback-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
