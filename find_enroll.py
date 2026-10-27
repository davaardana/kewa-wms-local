import os, subprocess

results = {}

for root, dirs, files in os.walk("/var/www/mosa/backend"):
    dirs[:] = [d for d in dirs if d not in ['vendor', '.git', 'node_modules', 'storage', 'bootstrap/cache']]
    for fname in files:
        if fname.endswith('.php'):
            path = os.path.join(root, fname)
            try:
                with open(path) as f:
                    content = f.read()
                if 'nrollment' in content or 'NROLLMENT' in content or 'nroll' in content.lower():
                    results['BE:'+path.replace('/var/www/mosa/','')]=True
            except: pass

for root, dirs, files in os.walk("/var/www/mosa/edge-bridge/src"):
    for fname in files:
        if fname.endswith('.js') or fname.endswith('.mjs'):
            path = os.path.join(root, fname)
            try:
                with open(path) as f:
                    content = f.read()
                if 'nrollment' in content or 'NROLLMENT' in content:
                    results['EDGE:'+path.replace('/var/www/mosa/','')]=True
            except: pass

for root, dirs, files in os.walk("/var/www/mosa/frontend/src"):
    for fname in files:
        if fname.endswith('.jsx') or fname.endswith('.js'):
            path = os.path.join(root, fname)
            try:
                with open(path) as f:
                    content = f.read()
                if 'nrollment' in content or 'NROLLMENT' in content:
                    results['FE:'+path.replace('/var/www/mosa/','')]=True
            except: pass

for k in sorted(results): print(k)
