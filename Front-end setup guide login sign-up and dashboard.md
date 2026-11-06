# Front-end setup guide: login/sign-up and dashboard

For the developer who will download the front-end pages and connect them to the backend.

## 1. The two links

Each link opens a website page where you can download the front-end code for that part of the project.

| Page | Download link | What it is |
| --- | --- | --- |
| Login and sign-up | <https://colorlib.com/wp/template/relay-auth/> | Where students create an account (name, email, password, scholarship countries) and log in |
| Dashboard | <https://themefisher.com/products/bingo-bootstrap> | The page students land on after logging in |

There is also a student profile page (photo, email, password, countries). It has its own guide called "Profile page integration guide". Read that one when you reach the profile page.

**Suggested order:** login and sign-up first, then the dashboard, then the profile page. Each page depends on the one before it, because a student cannot see the dashboard until they can log in.

## 2. How the pages fit together

1. A new student signs up. The sign-up form collects name, email, password and the countries they want scholarships in.
2. The student logs in.
3. After a successful login, the student is sent to the dashboard.
4. From the dashboard, the student can open the profile page to change their email, password, photo and countries.
5. Logging out sends the student back to the login page.

Your job is to make each of these steps work with the real backend. The pages already look finished and run with fake data, so you are mostly replacing the fake parts with real requests.

## 3. Before you start

You need:

- A web browser (Chrome or Edge is easiest, because of its developer tools)
- A code editor, such as VS Code
- A way to run a local web server (for example the "Live Server" extension in VS Code, or running `npx serve` in the folder)
- The list of backend endpoints you will connect to (ask the backend owner if you do not have it yet)
- A decision on how login works: cookies or tokens (see section 7)

These pages are plain HTML, CSS and JavaScript. There is nothing to install or build. Each page is a few files that you can open and edit directly.

## 4. Step-by-step setup (do this for each page)

### Step 1: Download

Open the link for the page and download the code. If it comes as a zip file, unzip it.

### Step 2: Check the files

You should see an `index.html`, a `styles.css` and a `script.js` (names may differ slightly for each page). Keep them together in the same folder. The HTML file loads the CSS and JavaScript by name, so moving one file elsewhere breaks the page.

### Step 3: Run it locally

Do not double-click `index.html` once you start adding requests to the backend. Browsers block many requests from files opened that way. Start a local server in the folder and open the address it gives you, usually something like `http://localhost:3000` or `http://127.0.0.1:5500`.

### Step 4: Look around

Click through the page. Everything should work with fake data and show success messages. If it does, the download is fine.

### Step 5: Find the places to connect

Open `script.js` and search for `TODO`. Each `// TODO: API call here` comment marks one place where a real request belongs. Read the code just above it to see what data the page collects.

### Step 6: Connect one thing at a time

Replace the fake wait (`fakeRequest()`) with a real `fetch` call. Test that one action completely before moving to the next one.

### Step 7: Put it in the backend project

When it works, copy the page's folder to wherever your backend serves static files (for example a `public` or `static` folder). Check that the CSS, JavaScript and fonts still load from there (see "If something breaks" below).

## 5. Login and sign-up page

**What to connect**

| Action | What to send | What should happen |
| --- | --- | --- |
| Sign up | Name, email, password, list of countries | The backend creates the account. Then send the student to the login page or log them in directly |
| Log in | Email and password | The backend confirms them. Save the login (cookie or token), then go to the dashboard |
| Forgot password | Email address | The backend emails a reset link |

**A simple login example**

```js
const res = await fetch("/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ email, password }),
});
if (res.ok) {
  window.location.href = "/dashboard.html";   // use your real dashboard address
} else {
  // show one message for any failure
  showError("Incorrect email or password.");
}
```

The function names (like `showError`) and field names in the downloaded code may be different. Use the names you find in the file, not the ones in this example.

**Be careful with**

- **Countries:** The sign-up page and the profile page must save countries in the same format, for example the full name `Germany` or a code `DE`. If one page saves names and the other expects codes, the profile page will show no selected countries. Agree on one format with the backend owner first.
- **Password rules:** The page checks the password length. The backend must enforce the same minimum, and ideally stricter checks too.
- **Error messages on login:** Always show the same message for a wrong email and a wrong password, such as "Incorrect email or password". Do not say "this email does not exist", because that tells strangers who has an account.
- **Duplicate emails:** If the email is already registered, the backend should say so, and the page should show it next to the email field.

## 6. Dashboard

**What to connect**

| Action | What to do |
| --- | --- |
| Check the student is logged in | Run this as soon as the page opens. If not logged in, send them to the login page |
| Load the student's data | Ask the backend for the name, photo and any other info the dashboard shows |
| Log out | Tell the backend to end the session, then go to the login page |
| Link to the profile page | Make sure the profile button or link points to the real profile page address |

**A simple login check at the top of the dashboard script**

```js
async function requireLogin() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.status === 401) {
    window.location.href = "/login.html";   // use your real login address
    return null;
  }
  return res.json();
}
```

**Be careful with**

- **Hiding the page is not security.** Redirecting to the login page only stops honest users. The backend must check the login on every request for student data, because anyone can bypass the front end.
- **Flash of fake content.** The dashboard shows placeholder names and numbers until real data arrives. Make sure the real data replaces all of it, and decide what shows while loading (for example a blank space or "Loading...").
- **Empty states.** A new student has no photo and no activity yet. Test with a brand new account to make sure nothing looks broken.

## 7. Be careful: the things that go wrong most often

### Do not rename ids or classes

The JavaScript finds elements by their `id`. If you rename `emailForm` in the HTML but not in the script, that button or section stops working. If you must rename, change both files.

### Keep files together and paths working

If the page looks plain (no colors) or does nothing, the CSS or JavaScript did not load. Open the browser tools (press F12), go to the Network tab, reload, and look for red or 404 items. The fix is usually a wrong file path after moving the folder.

### Remove every fake request

Search for `fakeRequest` and delete every use once the real request is in. If one is left, the page will say "saved" even when the server failed.

### Only update the page after the server says yes

Change the on-screen data only after a successful response. Otherwise the student sees the new email while the database still has the old one.

### Handle errors, not just success

Wrap every request in `try/catch`. Show a red message for failures, such as no network or a server error. Silence is the worst result: the student clicks, nothing happens, and they do not know why.

### Pick one login method and use it everywhere

- **Cookies:** add `credentials: "include"` to every `fetch`. The backend must allow this in its CORS settings. This is usually the safer choice for a student portal.
- **Tokens:** send the token with every request in an `Authorization` header. Decide where it is stored and how it is cleared on logout.

Mixing the two across pages is a common cause of "works on one page, 401 on another".

### Never repeat the front-end checks only on the front end

File size, file type, password rules, email format: the backend must check all of them again. A browser check is for convenience, not protection.

### Protect passwords

Never log passwords with `console.log`, never put them in a web address, and always run the live site on HTTPS.

### CORS errors

Red "CORS" messages in the browser console mean the backend does not allow requests from the page's address. The backend owner must add it to the allowed origins. This is a backend setting, not something to fix in the front end.

### Fonts need the internet

The pages load their fonts from Google Fonts. If the live site must work offline, or you prefer not to use Google, download the fonts and host them with the site. If the fonts fail to load, the page still works with system fonts but looks slightly different.

### Change colors in one place

All colors are in the `:root` block at the top of `styles.css`. Edit them there rather than adding colors in the JavaScript or HTML.

### Design is for desktop first

The pages are made for desktop screens. They shrink reasonably on smaller screens, but they have not been tuned for phones. Test on desktop first.

### Work on a copy or a branch

Keep the original download untouched, and do your changes in the project repository on a branch. That way you can compare against the original if something breaks.

## 8. If something breaks

Open the browser tools with F12. Two tabs help most: **Console** (red error messages) and **Network** (every request and its result).

| What you see | Likely cause | What to do |
| --- | --- | --- |
| Page has no colors or layout | CSS did not load | Check the file path in the HTML and the Network tab for 404 |
| Buttons do nothing | JavaScript failed to load, or an id was renamed | Check the Console for red errors that name the missing element |
| "Saved" appears but nothing changes in the database | `fakeRequest()` still there | Search for it and replace with a real request |
| Request status 401 | Not logged in, or cookie/token not sent | Add `credentials: "include"` or the token header |
| Request status 403 | Not allowed (for example wrong password) | Match what the backend sends for this case and show the right message |
| Request status 404 | Wrong endpoint address | Compare with the backend's documented path |
| Request status 500 | Backend error | Check the backend logs, not the front end |
| CORS error in Console | Backend does not allow this address | Ask the backend owner to allow it |
| Profile shows no selected countries | Country format differs between pages | Agree on names or codes and use the same everywhere |
| Page works in the local server but not on the live site | Different addresses or HTTP vs HTTPS | Check that endpoint addresses and cookie settings match the live setup |

## 9. Full test before handing it back

Try the whole journey with a brand new test account.

- Sign up with valid details and a few countries. The account is created.
- Try to sign up again with the same email. A clear message appears.
- Log in with the wrong password. A generic error appears, no redirect.
- Log in correctly. You land on the dashboard with the real name and data.
- Open the dashboard in a private window without logging in. You are sent to the login page.
- Open the profile page. The countries chosen at sign-up show as selected.
- Change a setting on the profile page, refresh, and confirm it saved.
- Click forgot password. The email arrives and the link works.
- Log out. The dashboard is no longer reachable, including with the browser back button.
- Turn the network off and try an action. A red error message appears.
