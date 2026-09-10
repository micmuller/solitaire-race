#!/usr/bin/python3
"""HighNoon-only NAS copy. Never reads or logs SMB credentials."""
import fcntl, hashlib, json, os, re, shutil, subprocess, tempfile
from datetime import datetime, timezone
from pathlib import Path

def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout

def verify(p):
    manifests=list(p.glob('*.sqlite.manifest.json'))
    if len(manifests)!=1: raise ValueError('Exactly one snapshot manifest required')
    m=json.loads(manifests[0].read_text()); name=m['backupFile']
    if Path(name).name!=name or not name.endswith('.sqlite'): raise ValueError('Invalid snapshot filename')
    db=p/name
    if hashlib.sha256(db.read_bytes()).hexdigest()!=m['sha256']: raise ValueError('Snapshot checksum mismatch')
    if m['integrity']!='ok' or m['foreignKeyViolations']!=0: raise ValueError('Snapshot integrity failed')
    return m,[db,manifests[0],p/'release.json']

def main():
    lock=open('/run/lock/micnet-nas-backup.lock','w'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    output=run('/srv/micnet/stacks/highnoon/backup.sh')
    result=json.loads(output.strip().splitlines()[-1])
    source=Path('/srv/micnet/backups/highnoon-beta')/Path(result['backupDirectory']).name
    m,files=verify(source)
    stamp=datetime.fromisoformat(m['createdAt'].replace('Z','+00:00'))
    day=stamp.strftime('%Y-%m-%d'); month=stamp.strftime('%Y-%m')
    mount=Path('/mnt/highnoon-terastore'); mount.mkdir(mode=0o700,exist_ok=True)
    if subprocess.run(['mountpoint','-q',str(mount)]).returncode==0: raise RuntimeError('Dedicated mountpoint already mounted')
    credential=Path('/root/.micnet-secrets/terastore-smb.credentials')
    if credential.stat().st_mode & 0o777 != 0o600 or credential.stat().st_uid!=0: raise RuntimeError('Unsafe credential permissions')
    run('mount','-t','cifs','//terastore.micnet.ch/install',str(mount),'-o','credentials='+str(credential)+',vers=3.1.1,seal,uid=0,gid=0,file_mode=0600,dir_mode=0700,nosuid,nodev,noexec')
    try:
        root=mount/'Linux-Host-1_Backup/highnoon-beta'
        for category,slot in [('daily',day),('monthly',month)]:
            parent=root/category; parent.mkdir(parents=True,exist_ok=True)
            incoming=Path(tempfile.mkdtemp(prefix='.incoming-',dir=parent))
            for f in files: shutil.copyfile(f,incoming/f.name)
            verify(incoming)
            target=parent/slot
            previous=parent/(slot+'.previous-'+str(os.getpid()))
            if target.exists(): target.rename(previous)
            incoming.rename(target)
            verify(target)
            if previous.exists(): shutil.rmtree(previous)
        # Re-read the actual NAS daily package, then stage an isolated restore input.
        recovered=Path('/srv/micnet/backups/highnoon-nas-restore')/source.name
        recovered.mkdir(parents=True,exist_ok=False,mode=0o700)
        for f in files: shutil.copyfile(root/'daily'/day/f.name,recovered/f.name)
        verify(recovered)
        (root/'.LATEST.tmp').write_text(day+'\n'); (root/'.LATEST.tmp').replace(root/'LATEST')
        # Retention is permitted only after verified NAS copies and readback.
        for category,keep,pattern in [('daily',30,r'\d{4}-\d{2}-\d{2}'),('monthly',12,r'\d{4}-\d{2}')]:
            slots=sorted([p for p in (root/category).iterdir() if p.is_dir() and re.fullmatch(pattern,p.name)],reverse=True)
            for old in slots[keep:]: shutil.rmtree(old)
        run('sync','-f',str(root))
        state={'status':'PASS','lastSuccessfulBackup':m['createdAt'],'verifiedAt':datetime.now(timezone.utc).isoformat(),'source':str(source),'nasDaily':day,'nasMonthly':month,'sha256':m['sha256'],'restoreInput':str(recovered),'dailyKeep':30,'monthlyKeep':12}
        out=Path('/srv/micnet/config/highnoon/backup-status.json'); tmp=out.with_suffix('.tmp'); tmp.write_text(json.dumps(state,indent=2)+'\n'); tmp.replace(out)
        print(json.dumps(state))
    finally:
        run('umount',str(mount))

if __name__=='__main__':
    os.umask(0o077)
    main()
