#!/usr/bin/python3
from pathlib import Path
import subprocess
rules = ''
for family, name in [('bridge', 'highnoon_guard'), ('inet', 'highnoon_host_guard')]:
    if subprocess.run(['/usr/sbin/nft', 'list', 'table', family, name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        rules += f'delete table {family} {name}\n'
rules += Path('/etc/highnoon-isolation.nft').read_text()
subprocess.run(['/usr/sbin/nft', '-c', '-f', '-'], input=rules, text=True, check=True)
subprocess.run(['/usr/sbin/nft', '-f', '-'], input=rules, text=True, check=True)
