import subprocess, json

# Query GateDevice
r = subprocess.run(
    ['docker', 'exec', 'mosa-backend', 'php', '-r',
     'require "/var/www/backend/vendor/autoload.php"; '
     '$app=require "/var/www/backend/bootstrap/app.php"; '
     '$app->make("Illuminate\\Contracts\\Console\\Kernel")->bootstrap(); '
     '$d=\\App\\Models\\GateDevice::all()->map(fn($x)=>['
     '"id"=>$x->id,"code"=>$x->device_code,"role"=>$x->device_role,'
     '"ws"=>$x->edge_ws_url,"ip"=>$x->ip_address,"port"=>$x->tcp_port,'
     '"wh"=>$x->warehouse_id,"active"=>$x->is_active])->toArray(); '
     'echo json_encode($d, JSON_PRETTY_PRINT);'
    ],
    capture_output=True, text=True
)
print("=== GateDevices ===")
print(r.stdout or r.stderr)

# Read env
print("\n=== ENV (WS/PILOT/READER) ===")
with open('/var/www/mosa/.env') as f:
    for line in f:
        l = line.strip()
        if any(k in l for k in ['WS_CONTROL','PILOT','READER','DEVICE_TOKEN','EDGE','GATE_ID','WAREHOUSE','API_BASE']):
            # mask passwords/tokens
            if '=' in l:
                k,v = l.split('=',1)
                if 'SECRET' in k or 'TOKEN' in k or 'PASSWORD' in k:
                    v = v[:4]+'****' if v else '(empty)'
                print(f"  {k}={v}")

# Edge .env
print("\n=== Edge .env ===")
try:
    with open('/var/www/mosa/edge-bridge/.env') as f:
        for line in f:
            l = line.strip()
            if l and not l.startswith('#'):
                if '=' in l:
                    k,v = l.split('=',1)
                    if 'SECRET' in k or 'TOKEN' in k or 'PASSWORD' in k or 'KEY' in k:
                        v = v[:4]+'****' if v else '(empty)'
                    print(f"  {k}={v}")
except: print("  (no edge .env)")
