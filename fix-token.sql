UPDATE gate_devices
SET api_token_hash = encode(sha256('cb076bdc01876e19f27b2459db3d324f907d74f9260a2c12bc9bda3f0f19c364'::bytea), 'hex')
WHERE device_code = 'GATE-01';

SELECT device_code, api_token_hash FROM gate_devices;
