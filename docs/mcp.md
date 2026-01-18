---
title: MCP Tools
description: Claude Code integration via Model Context Protocol
order: 5
---

# MCP Tools

vif exposes all its capabilities as MCP (Model Context Protocol) tools, allowing Claude Code to control screen capture, overlays, and browser automation directly.

## Setup

Start the MCP server:
```bash
vif-mcp
```

Add to Claude Code's MCP configuration (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "vif": {
      "command": "vif-mcp"
    }
  }
}
```

**Note:** Demo overlay tools require the vif server running (`vif serve`).

## Tool Categories

### Cursor Overlay Tools

| Tool | Description |
|------|-------------|
| `vif_cursor_show` | Show the animated cursor overlay |
| `vif_cursor_hide` | Hide the cursor overlay |
| `vif_cursor_move` | Move cursor to position with animation |
| `vif_cursor_click` | Perform click animation at current position |

**Example:**
```
Claude, show the cursor at position 500, 300 and click
```

### Label/Caption Tools

| Tool | Description |
|------|-------------|
| `vif_label_show` | Show a text label overlay |
| `vif_label_update` | Update the label text |
| `vif_label_hide` | Hide the label |

**Parameters for `vif_label_show`:**
- `text` (required): Text to display
- `position`: "top" or "bottom" (default: "top")

### Backdrop/Stage Tools

| Tool | Description |
|------|-------------|
| `vif_backdrop_show` | Dim everything outside viewport |
| `vif_backdrop_hide` | Remove backdrop dimming |
| `vif_stage_center` | Center an app window on screen |
| `vif_stage_clear` | Clear all overlays |

**Parameters for `vif_stage_center`:**
- `app` (required): App name (e.g., "Safari", "Finder")
- `width`: Window width
- `height`: Window height

### Viewport Tools

| Tool | Description |
|------|-------------|
| `vif_viewport_set` | Define the visible region |
| `vif_viewport_show` | Show viewport mask |
| `vif_viewport_hide` | Hide viewport mask |

**Parameters for `vif_viewport_set`:**
- `x`, `y`, `width`, `height` (all required)

### Keyboard Overlay Tools

| Tool | Description |
|------|-------------|
| `vif_keys_show` | Show keyboard shortcut overlay |
| `vif_keys_hide` | Hide keyboard overlay |

**Parameters for `vif_keys_show`:**
- `keys` (required): Array of keys, e.g., `["cmd", "shift", "p"]`
- `press`: Animate as keypress (boolean)

### Typer Overlay Tools

| Tool | Description |
|------|-------------|
| `vif_typer_type` | Show animated typing overlay |
| `vif_typer_hide` | Hide typer overlay |

**Parameters for `vif_typer_type`:**
- `text` (required): Text to type
- `style`: "default", "terminal", or "code"
- `delay`: Seconds between characters (default: 0.05)

### Recording Tools

| Tool | Description |
|------|-------------|
| `vif_record_indicator` | Show/hide recording indicator |

**Parameters:**
- `show` (required): Boolean

## Browser Automation Tools

These tools control Chrome via CDP (Chrome DevTools Protocol).

| Tool | Description |
|------|-------------|
| `vif_browser_launch` | Launch Chrome and connect |
| `vif_browser_navigate` | Navigate to URL |
| `vif_browser_click` | Click element by CSS selector |
| `vif_browser_type` | Type text into element |
| `vif_browser_scroll` | Scroll page or element |
| `vif_browser_extract` | Extract data using selectors |
| `vif_browser_press` | Press key or shortcut |
| `vif_browser_hover` | Hover over element |
| `vif_observe` | Get interactive elements on page |
| `vif_click_element` | Click by node ID (from observe) |
| `vif_screenshot` | Take browser screenshot |
| `vif_browser_close` | Close browser connection |

### Browser Tool Parameters

**`vif_browser_launch`**
- `url` (optional): Initial URL to navigate to
- `headless` (optional): Run in headless mode

**`vif_browser_navigate`**
- `url` (required): URL to navigate to

**`vif_browser_click`**
- `selector` (required): CSS selector

**`vif_browser_type`**
- `selector` (required): CSS selector
- `text` (required): Text to type
- `clear` (optional): Clear existing text first
- `delay` (optional): Delay between keystrokes (ms)

**`vif_browser_scroll`**
- `direction` (required): "up", "down", "left", or "right"
- `amount` (optional): Pixels to scroll
- `selector` (optional): Element to scroll

**`vif_browser_extract`**
- `selectors` (required): Object mapping names to CSS selectors
  ```json
  { "title": "h1", "links": "a.nav-link" }
  ```

**`vif_observe`**
- `format` (optional): "clickable" (default), "accessibility", or "full"
- `selector` (optional): Filter to specific selector

**`vif_screenshot`**
- `path` (optional): Save path
- `fullPage` (optional): Capture full page
- `selector` (optional): Capture specific element

## Example Conversations

### Demo Recording

```
User: Record a demo of our app's new feature

Claude: I'll set up the stage and record. Let me:
1. Center the app window
2. Show the backdrop
3. Record the demo with cursor and labels

[Uses vif_stage_center, vif_backdrop_show, vif_cursor_show,
vif_cursor_move, vif_cursor_click, vif_label_show, etc.]
```

### Web Scraping

```
User: Go to Hacker News and get the top 5 story titles

Claude: I'll navigate to Hacker News and extract the titles.

[Uses vif_browser_launch, vif_browser_navigate, vif_browser_extract]

Here are the top 5 stories:
1. Show HN: ...
2. ...
```

### Automated Testing

```
User: Test the login flow on our staging site

Claude: I'll test the login flow.

[Uses vif_browser_launch with staging URL]
[Uses vif_observe to find login form]
[Uses vif_browser_type for email and password]
[Uses vif_browser_click to submit]
[Uses vif_screenshot to capture result]

Login successful. Screenshot saved.
```

## Tool Availability

| Tool Category | Requires `vif serve` | Requires Chrome |
|--------------|---------------------|-----------------|
| Cursor/Label/Stage | Yes | No |
| Viewport/Backdrop | Yes | No |
| Keys/Typer | Yes | No |
| Browser tools | No | Yes |

## Error Handling

Tools return error messages when:
- `vif serve` is not running (for overlay tools)
- Chrome is not available (for browser tools)
- Element not found (for click/type actions)
- Navigation timeout

Claude should handle these gracefully and inform the user.
