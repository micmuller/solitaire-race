import subprocess,json,tarfile,hashlib
from pathlib import Path
root=Path('/srv/micnet/releases/highnoon/7f5ca0a4d483a4a7a461ecec4894585027d9fc80/evidence');root.mkdir(exist_ok=True)
images={'ws-app':'highnoon-app:7f5ca0a4d483a4a7a461ecec4894585027d9fc80','ws-origin':'highnoon-origin:7f5ca0a4d483a4a7a461ecec4894585027d9fc80','node-proposal':'node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5','nginx-slim-proposal':'nginx@sha256:d6d5b2985faade9971eb1bec34c3f778b800f872f236969b3fd1ba65f4692b54'}
subprocess.run(['docker','pull','--platform','linux/amd64',images['nginx-slim-proposal']],check=True)
provenance={}
for name,ref in images.items():
 im=json.loads(subprocess.check_output(['docker','image','inspect',ref]))[0]
 archive=root/(name+'.tar');subprocess.run(['docker','save','-o',str(archive),ref],check=True)
 subprocess.run(['docker','run','--rm','--read-only','--user','0:0','--cap-drop','ALL','--security-opt','no-new-privileges:true','--cpus','.5','--memory','3g','--pids-limit','128','--mount','type=volume,src=highnoon-trivy-cache,dst=/root/.cache','--mount','type=bind,src='+str(root)+',dst=/out','--mount','type=bind,src='+str(archive)+',dst=/scan/image.tar,readonly','--tmpfs','/tmp:rw,size=2g','aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969','image','--input','/scan/image.tar','--scanners','vuln','--list-all-pkgs','--format','json','--output','/out/'+name+'-scan.json'],check=True)
 with tarfile.open(archive) as t:
  m=json.load(t.extractfile('manifest.json'))[0];raw=t.extractfile(m['Config']).read();cfg=json.loads(raw)
 digest='sha256:'+hashlib.sha256(raw).hexdigest();scan=json.loads((root/(name+'-scan.json')).read_text());assert digest==scan['Metadata']['ImageID'];assert cfg['rootfs']['diff_ids']==im['RootFS']['Layers']
 provenance[name]={'reference':ref,'imageId':im['Id'],'scanConfigDigest':digest,'rootfsMatches':True,'platform':im['Os']+'/'+im['Architecture'],'revision':im['Config'].get('Labels',{}).get('org.opencontainers.image.revision')}
(root/'scan-provenance.json').write_text(json.dumps(provenance,indent=2));print(json.dumps(provenance,indent=2))
