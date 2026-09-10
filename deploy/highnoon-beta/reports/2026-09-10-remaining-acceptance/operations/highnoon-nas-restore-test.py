#!/usr/bin/python3
import json,os,shutil,subprocess,sqlite3,hashlib,time,tempfile
from pathlib import Path
IMAGE='sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553'
started=time.monotonic()
root=Path(tempfile.mkdtemp(prefix='restore-',dir='/srv/micnet/releases/highnoon-acceptance-evidence'))
root.chmod(0o755)
source=Path(json.loads(Path('/srv/micnet/config/highnoon/backup-status.json').read_text())['restoreInput'])
for name in ['data','input','safety']:
    p=root/name;p.mkdir(mode=0o700);os.chown(p,1000,1000)
for p in source.iterdir():
    dest=root/'input'/p.name;shutil.copyfile(p,dest);os.chmod(dest,0o600);os.chown(dest,1000,1000)
backup=next((root/'input').glob('*.sqlite')); manifest=json.loads(Path(str(backup)+'.manifest.json').read_text())
common=['docker','run','--rm','--network','none','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','512m','--cpus','0.25','--pids-limit','64','--tmpfs','/tmp:rw,noexec,nosuid,size=16m,uid=1000,gid=1000','-v',str(root/'data')+':/data','-v',str(root/'input')+':/input','-v',str(root/'safety')+':/safety','-e','VNEXT_PROFILE_DATABASE=/data/highnoon.sqlite']
def run(args):
    p=subprocess.run(args,text=True,capture_output=True);print(p.stdout);print(p.stderr);p.check_returncode();return p.stdout
run(common+[IMAGE,'node','vnext/server/adminCli.js','verify','--from','/input/'+backup.name,'--backup-directory','/safety'])
run(common+[IMAGE,'node','vnext/server/adminCli.js','restore','--from','/input/'+backup.name,'--backup-directory','/safety','--confirm-target','/data/highnoon.sqlite'])
db=root/'data/highnoon.sqlite'; digest=hashlib.sha256(db.read_bytes()).hexdigest();assert digest==manifest['sha256']
overwrite=json.loads(run(common+[IMAGE,'node','vnext/server/adminCli.js','restore','--from','/input/'+backup.name,'--backup-directory','/safety','--confirm-target','/data/highnoon.sqlite']))
assert overwrite['safetyBackupPath'], 'Replacing scratch DB must produce a safety backup'
con=sqlite3.connect(f'file:{db}?mode=ro',uri=True)
assert con.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert con.execute('PRAGMA foreign_key_check').fetchall()==[]
tables=[r[0] for r in con.execute("select name from sqlite_master where type='table'")]
counts={t:con.execute('select count(*) from "'+t.replace('"','""')+'"').fetchone()[0] for t in tables}
# Preserve only table counts, not credentials, player rows or match contents.
con.close()
start=common.copy();start.remove('--rm');start[2:2]=['-d','--name','highnoon-nas-restore-test'];start += ['-e','HOST=0.0.0.0','-e','PORT=3011',IMAGE]
run(start)
health=None
try:
    for _ in range(15):
        p=subprocess.run(['docker','exec','highnoon-nas-restore-test','node','-e',"fetch('http://127.0.0.1:3011/health').then(async r=>{console.log(r.status);console.log(await r.text());if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],text=True,capture_output=True)
        if p.returncode==0: health=p.stdout;break
        time.sleep(1)
    assert health, 'Restored app did not become healthy'
finally:run(['docker','rm','-f','highnoon-nas-restore-test'])
out={'status':'PASS','source':'NAS readback','snapshotSHA256':digest,'integrity':'ok','foreignKeyViolations':0,'tables':counts,'health':health,'image':IMAGE,'liveDatabaseTouched':False,'scratchRoot':str(root),'recoveryDurationSeconds':round(time.monotonic()-started,3),'timingScope':'Already-downloaded NAS package to isolated app health; includes second overwrite/safety-backup test, excludes NAS transfer and browser login','safetyBackupCreated':bool(overwrite['safetyBackupPath'])}
(root.parent/'nas-restore-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
