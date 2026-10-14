"""Simulate N students polling the app. Usage:
  python scripts/loadtest.py https://YOUR-URL you@college.edu 'password' [users=100] [seconds=60]
Uses one real login for every virtual user and mirrors what the screens request every 20 seconds."""
import asyncio, statistics, sys, time
import httpx

async def main(base, email, pw, users=100, secs=60):
    async with httpx.AsyncClient(base_url=base, timeout=30) as c:
        r = await c.post("/api/v1/auth/login", json={"email": email, "password": pw}); r.raise_for_status(); h = {"Authorization": "Bearer " + r.json()["access_token"]}
    paths = ["/api/v1/dashboard/summary", "/api/v1/duties/my-duties", "/api/v1/issues?limit=50", "/api/v1/issues/overdue",
             "/api/v1/calendar?start=2026-01-01T00:00:00Z&end=2027-01-01T00:00:00Z", "/api/v1/notifications"]
    lat, bad, end = [], 0, time.time() + secs
    async def user(i, c):
        nonlocal bad
        await asyncio.sleep(i * 0.2)
        while time.time() < end:
            for p in paths:
                t = time.perf_counter()
                try: r = await c.get(p, headers=h); bad += r.status_code >= 400
                except Exception: bad += 1
                lat.append((time.perf_counter() - t) * 1000)
            await asyncio.sleep(20)
    async with httpx.AsyncClient(base_url=base, timeout=30, limits=httpx.Limits(max_connections=users)) as c:
        await asyncio.gather(*(user(i, c) for i in range(users)))
    lat.sort(); q = lambda p: lat[int(len(lat) * p) - 1]
    print(f"requests={len(lat)} errors={bad} p50={q(.5):.0f}ms p95={q(.95):.0f}ms p99={q(.99):.0f}ms max={lat[-1]:.0f}ms")
    print("PASS" if bad == 0 and q(.95) < 1500 else "REVIEW: errors or slow p95")

if __name__ == "__main__":
    a = sys.argv; asyncio.run(main(a[1], a[2], a[3], int(a[4]) if len(a) > 4 else 100, int(a[5]) if len(a) > 5 else 60))
