"""Browser self-check for the synthetic station prototype; uses installed Python Playwright.

Run from any directory: python <absolute path to this file>
Screenshots go to the repository's ignored artifacts/station-prototype directory.
The browser is isolated and closed on completion, including assertion failures.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

gallery = Path(__file__).resolve().parent
repo = gallery.parent.parent
output = repo / 'artifacts' / 'station-prototype'
output.mkdir(parents=True, exist_ok=True)


def scrub(page, position):
    page.locator('#position').fill(str(position))
    expect(page.locator('#total')).to_have_text(str(position))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    try:
        page = browser.new_page(viewport={'width': 1500, 'height': 1150})
        errors, remote = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: remote.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        page.goto((gallery / 'station.html').as_uri())
        expect(page.locator('#total')).to_have_text('12')
        expect(page.locator('#total')).to_have_text('13', timeout=4000)
        assert page.locator('#signals circle').count() > 0, 'Playback did not emit a visual signal'
        page.get_by_role('button', name='Pause', exact=True).click()
        paused = page.locator('#total').inner_text()
        page.wait_for_timeout(2100)
        expect(page.locator('#total')).to_have_text(paused)
        assert page.locator('#signals circle').count() == 0

        for position, expected_errors in [(0, 0), (17, 0), (18, 1), (30, 1), (31, 2), (42, 2)]:
            scrub(page, position)
            expect(page.locator('#errors')).to_contain_text(f'{expected_errors} errors')
            assert sum(int(n) for n in page.locator('.station-button strong').all_text_contents()) == position
        expect(page.locator('#context')).to_contain_text('66%')
        expect(page.locator('#play')).to_have_text('Replay')

        for kind in ['files', 'edits', 'shell', 'network', 'agents', 'memory']:
            page.locator(f'#station-{kind}').focus()
            page.keyboard.press('Enter')
            expect(page.locator(f'#station-{kind}')).to_have_attribute('aria-pressed', 'true')
            assert page.locator('#events .event').count() > 0
            resource = page.locator('#resources .resource').first
            resource_name = resource.locator('span').inner_text()
            resource.click()
            expect(page.locator('#inspector-title')).to_have_text(resource_name)
            origin = page.locator('#events .event').first
            event_id = origin.get_attribute('data-event')
            origin.click()
            expect(page.locator('#event-dialog')).to_be_visible()
            assert page.locator('#detail-input').inner_text()
            assert page.locator('#detail-output').inner_text()
            page.keyboard.press('Escape')
            expect(page.locator('#event-dialog')).not_to_be_visible()
            expect(page.locator(f'#events [data-event="{event_id}"]')).to_be_focused()

        page.locator('#errors').click()
        expect(page.locator('#events .event')).to_have_count(2)
        page.locator('#events [data-event="call-018"]').click()
        expect(page.locator('#detail-input')).to_contain_text('GET')
        expect(page.locator('#detail-output')).to_contain_text('429')
        expect(page.locator('#detail-caution')).to_be_visible()
        page.screenshot(path=str(output / 'api-error-detail.png'))
        page.locator('#next-event').click()
        expect(page.locator('#detail-output')).to_contain_text('AssertionError')
        page.locator('#previous-event').click()
        expect(page.locator('#detail-output')).to_contain_text('429')
        page.locator('#related-resource').click()
        expect(page.locator('#inspector-title')).to_have_text('GET /activity')
        expect(page.locator('#only-errors')).not_to_be_checked()
        expect(page.locator('#events .event')).to_have_count(3)
        page.screenshot(path=str(output / 'landscape.png'), full_page=True)

        page.locator('#view').select_option('flat')
        assert page.locator('body').evaluate("e => e.classList.contains('flat-view')")
        assert page.locator('.flat-shape').first.is_visible()
        page.locator('#view').select_option('isometric')
        page.locator('#reset-view').click()
        scrub(page, 0)
        expect(page.locator('#resources')).to_contain_text('No resources')
        expect(page.locator('#events')).to_contain_text('No calls match')
        page.locator('#speed').select_option('4')
        page.locator('#play').click()
        expect(page.locator('#total')).not_to_have_text('0', timeout=2000)
        page.locator('#play').click()

        page.emulate_media(reduced_motion='reduce')
        page.reload()
        expect(page.locator('#play')).to_have_text('Play')
        expect(page.locator('#motion')).not_to_be_checked()
        expect(page.locator('#motion')).to_be_disabled()
        page.locator('#play').click()
        expect(page.locator('#total')).to_have_text('13', timeout=4000)
        assert page.locator('#signals circle').count() == 0
        page.locator('#play').click()
        scrub(page, 42)

        for width in [768, 390]:
            page.set_viewport_size({'width': width, 'height': 900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflow at {width}'
            page.locator('[data-station="network"]').click()
            page.locator('#events .event').first.click()
            assert page.locator('#event-dialog').evaluate('e => e.scrollWidth <= e.clientWidth'), f'Dialog overflow at {width}'
            page.locator('#close-detail').click()
        page.screenshot(path=str(output / 'mobile.png'), full_page=True)
        assert not errors, errors
        assert not remote, remote
        print('PASS: playback and signals; pause; time-consistent totals and errors; all six stations; resource drill-down; input/output details; error navigation; keyboard and focus return; flat view; empty state; speed; reduced motion; 768/390px overflow; no JS errors or network requests.')
    finally:
        browser.close()
