import asyncio
# pyrefly: ignore [missing-import]
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to frontend...")
        await page.goto("http://localhost:5173")
        
        # Check if we are on login page or signup page
        print("Logging in or signing up...")
        if await page.locator('text=Sign Up').is_visible():
            await page.click('text=Sign Up')
            
        await page.fill('input[type="email"]', 'playwright_e2e@example.com')
        await page.fill('input[type="password"]', 'password123')
        
        # If there's a name field, we're on sign up
        name_input = page.locator('input[placeholder="Name"]')
        if await name_input.is_visible():
            await name_input.fill('Playwright User')
            
        await page.click('button[type="submit"]')
        
        try:
            await page.wait_for_selector('text=Workspaces', timeout=5000)
            print("E2E Login Successful!")
        except Exception as e:
            print("Login failed, trying to switch to login mode...")
            await page.click('text=Log In')
            await page.fill('input[type="email"]', 'playwright_e2e@example.com')
            await page.fill('input[type="password"]', 'password123')
            await page.click('button[type="submit"]')
            await page.wait_for_selector('text=Workspaces', timeout=5000)
            print("E2E Login Successful!")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
