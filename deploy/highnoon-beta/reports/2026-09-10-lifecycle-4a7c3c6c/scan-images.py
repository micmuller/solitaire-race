import subprocess,json,tarfile,hashlib
from pathlib import Path
root=Path('/srv/micnet/releases/highnoon/4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc/evidence');root.mkdir(exist_ok=True)
images={'app':'highnoon-app:4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc','origin':'highnoon-origin:4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc'}
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
