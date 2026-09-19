"""Records Daybreak's 1-minute demo for the Base grant form: a scripted walk through the live site
with a caption bar, as a 1280x800 video. Run with env -u PYTHONPATH (the global one breaks Playwright)."""
import pathlib, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://daybreak.rebelstudiossoftware.com"
OUT = pathlib.Path(__file__).parent.parent / "out-demo"  # then: ffmpeg -ss 0.4 -i out-demo/*.webm -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart -an public/demo.mp4
OUT.mkdir(exist_ok=True)

CAPTION_JS = """(t) => {
  let el = document.getElementById('demo-cap');
  if (!el) {
    el = document.createElement('div'); el.id = 'demo-cap';
    Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 99999,
      background: 'rgba(11,11,12,.92)', color: '#f4f4f5', font: '500 17px/1.35 Geist, system-ui, sans-serif', letterSpacing: '-.01em',
      padding: '12px 20px', borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,.25)', maxWidth: '1100px', whiteSpace: 'nowrap', textAlign: 'center',
      transition: 'opacity .25s' });
    document.body.appendChild(el);
  }
  el.style.opacity = t ? '1' : '0'; if (t) el.textContent = t;
}"""

def cap(page, text):
    page.evaluate(CAPTION_JS, text)

def smooth_scroll(page, y, ms=1200):
    page.evaluate("""([y, ms]) => new Promise(r => { const s = scrollY, d = y - s, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
        scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(step) : r(); }; requestAnimationFrame(step); })""", [y, ms])

def goto(page, path):
    page.goto(BASE + path, wait_until="networkidle")
    page.wait_for_timeout(400)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, record_video_dir=str(OUT),
                              record_video_size={"width": 1280, "height": 800}, color_scheme="light", device_scale_factor=1)
    page = ctx.new_page()

    # 1. the gap map: faces are the creators whose audience hasn't found their coin
    goto(page, "/")
    cap(page, "Daybreak: free analytics for Zora creator coins, rebuilt every hour from Zora and Base")
    page.wait_for_timeout(3200)
    smooth_scroll(page, 330)
    cap(page, "The gap map: every creator's followers against their coin's holders")
    page.wait_for_timeout(1800)
    faces = page.locator("g.apt")
    if faces.count():
        faces.nth(0).hover(); page.wait_for_timeout(700)
        cap(page, "Big audience, few holders: fans who haven't found the coin yet")
        faces.nth(min(3, faces.count() - 1)).hover(); page.wait_for_timeout(2600)

    # 2. check any creator
    goto(page, "/check/")
    cap(page, "Check your coin works for any Zora creator")
    page.wait_for_timeout(1500)
    page.locator("#handle").click()
    page.keyboard.type("jacob", delay=110)
    page.keyboard.press("Enter")
    page.wait_for_selector("text=What to do next", timeout=20000)
    page.wait_for_timeout(700)
    smooth_scroll(page, 380)
    cap(page, "Followers next to holders, compared with Zora's top creators")
    page.wait_for_timeout(2800)
    steps = page.locator("h2:has-text('What to do next')")
    smooth_scroll(page, steps.evaluate("e => e.getBoundingClientRect().top + scrollY - 90"))
    cap(page, "...then the next step that fits those numbers")
    page.wait_for_timeout(3000)
    share = page.locator("h2:has-text('Share these numbers')")
    if share.count():
        smooth_scroll(page, share.evaluate("e => e.getBoundingClientRect().top + scrollY - 90"))
        cap(page, "One tap to share a card with the coin's art and numbers")
        page.wait_for_timeout(3000)

    # 3. rewards from Base
    goto(page, "/rewards/")
    cap(page, "Rewards: who Zora pays on every trade, decoded from Base")
    page.wait_for_timeout(3000)
    smooth_scroll(page, 420)
    cap(page, "Creators, the apps that create and route coins, the protocol, per day")
    page.wait_for_timeout(2800)
    smooth_scroll(page, 980)
    cap(page, "Top earners, named by their Zora profiles")
    page.wait_for_timeout(2600)

    # 4. tags
    goto(page, "/tags/")
    cap(page, "Tags: what Zora's trend coins trade, and which gain holders")
    page.wait_for_timeout(2600)
    smooth_scroll(page, 380)
    page.wait_for_timeout(1600)

    # 5. a coin page
    goto(page, "/leaderboard/")
    cap(page, "The gap leaderboard ranks creators by the audience still to reach")
    page.wait_for_timeout(2600)
    goto(page, "/coin/0x9b13358e3a023507e7046c18f508a958cda75f54/")  # $jacob: an active coin, so the charts have something to show
    cap(page, "Every coin gets a page: holders, churn, trading, concentration")
    page.wait_for_timeout(2600)
    smooth_scroll(page, 700)
    page.wait_for_timeout(2200)

    # 6. end card
    smooth_scroll(page, 0, 600)
    cap(page, "Free and open source · daybreak.rebelstudiossoftware.com · by Rebel Studios")
    page.wait_for_timeout(3000)

    video = page.video.path()
    ctx.close(); browser.close()
    print(video)
