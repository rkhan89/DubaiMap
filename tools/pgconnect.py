# A direct Postgres connection for the tools (overture-import.py, coverage-step0.py, places-backfill.py), from
# DATABASE_URL in the environment or .env.local (gitignored). The connection string is never printed or logged.
# pg8000 is pure Python (no compiled driver), so it runs where Windows blocks unsigned DLLs.
import os, ssl, sys, pathlib, urllib.parse
import pg8000.native

ROOT = pathlib.Path(__file__).resolve().parent.parent


def database_url():
    if os.environ.get('DATABASE_URL'):
        return os.environ['DATABASE_URL']
    env = ROOT / '.env.local'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    sys.exit('DATABASE_URL is not set (put it in .env.local)')


def connect():
    u = urllib.parse.urlparse(database_url())
    ctx = ssl.create_default_context()
    ctx.check_hostname = False          # Supabase's direct host presents its own CA; the link is still encrypted
    ctx.verify_mode = ssl.CERT_NONE
    return pg8000.native.Connection(user=urllib.parse.unquote(u.username or 'postgres'),
                                    password=urllib.parse.unquote(u.password or ''), host=u.hostname,
                                    port=u.port or 5432, database=(u.path or '/postgres').lstrip('/') or 'postgres',
                                    ssl_context=ctx, timeout=600)
