URL checked: https://jtc.lopyhupis.com
When: 2026-09-23 01:14 MDT
What would have made this fail: the security headers going missing on the main page, as they did before I moved them to server level (nginx drops inherited add_header lines when a location adds its own), so fetch.txt would show a 200 with no Content-Security-Policy.
