"""Serve the Fish Data Collector on your local network.

Run:  python serve.py [port]      (default port 8000)
Then open one of the printed http://<ip>:<port> addresses on the tablet.
"""
import http.server, os, socket, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows can map these wrongly from the registry; set them explicitly.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.webmanifest': 'application/manifest+json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def lan_ips():
    ips = set()
    try:  # the interface used for the default route (no packets are sent)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.') and not ip.startswith('169.254.'))


if __name__ == '__main__':
    try:
        server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    except OSError as e:
        sys.exit(f'Could not start on port {PORT}: {e}\nTry another port: python serve.py 8080')
    print('\nFish Data Collector is running. Open this on the tablet (same wifi):\n')
    for ip in lan_ips() or ['<your-pc-ip>']:
        print(f'    http://{ip}:{PORT}')
    print(f'\nOn this PC:  http://localhost:{PORT}')
    print('\nPress Ctrl+C to stop.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
