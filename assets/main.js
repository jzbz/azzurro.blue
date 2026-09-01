/* azzurro.blue
 *
 * Four jobs: remember a light/dark choice, drive the window rebuilt in the
 * page, copy the commands, and run artwork.rs's colour extraction over the
 * sleeves on a canvas.
 *
 * Nothing here is required to read the page. The queue, the transport bar and
 * the commands are all in index.html already, with the first track selected
 * and its tint set inline; this file only takes over so that clicking and
 * arrowing between rows works, and so the demo can measure real pixels.
 */
(function () {
    "use strict";

    var root = document.documentElement;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* ------------------------------------------------------------ theme */

    var stored = null;

    try {
        stored = localStorage.getItem("azzurro-theme");
    } catch (e) {
        /* Private mode, or storage disabled. The dark default stands. */
    }

    /* Reflect the theme on the control without claiming one, so the button is
       right even before anybody has chosen. */
    function syncButton(theme) {
        var button = document.getElementById("theme-toggle");
        if (!button) { return; }
        button.setAttribute("aria-pressed", String(theme === "dark"));
        button.setAttribute("aria-label", "Dark theme");
    }

    function current() {
        return root.classList.contains("light") ? "light" : "dark";
    }

    /* No stored choice means the stylesheet's own default — dark — stands, so
       there is nothing to stamp; the control just has to describe it. */
    if (stored === "light") { root.classList.add("light"); }
    syncButton(current());

    /* The browser's own chrome above the page is painted from this meta tag
       and does not follow a custom property, so it is set from the palette
       rather than written twice. */
    function paintChrome() {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) { return; }
        meta.setAttribute("content",
            getComputedStyle(root).getPropertyValue("--bg").trim());
    }

    paintChrome();

    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener("click", function () {
            var next = current() === "dark" ? "light" : "dark";

            /* Transitions off across the switch, and a forced reflow in the
               middle of it.

               A declared transition stops the property being recomputed when
               only a custom property underneath it changed: the header, the
               buttons, the player pill and the sleeve swatches all kept the
               palette they were built with while everything around them
               changed. Reading a layout property with transitions suppressed
               forces the recalculation that settles them on the new values,
               and restoring transitions afterwards then has nothing left to
               animate. Switching in one step is the better behaviour anyway —
               a theme change is one decision, not three hundred elements
               crossing over at their own pace. */
            root.classList.add("theming");
            root.classList.toggle("light", next === "light");
            void root.offsetHeight;
            root.classList.remove("theming");

            syncButton(next);
            paintChrome();

            try {
                localStorage.setItem("azzurro-theme", next);
            } catch (e) {
                /* The choice holds for this page view and no longer. */
            }
        });
    }

    /* ------------------------------------------------------ page chrome */

    var head = document.getElementById("siteHead");
    if (head) {
        var onScroll = function () {
            head.classList.toggle("is-stuck", window.scrollY > 8);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    }

    /* -------------------------------------------------------- the copy */

    var status = document.getElementById("copy-status");

    function announce(message) {
        if (status) { status.textContent = message; }
    }

    Array.prototype.forEach.call(document.querySelectorAll(".cmd"), function (block) {
        var button = block.querySelector(".copy");
        if (!button) { return; }

        /* The clipboard API is missing on any origin that is not secure. A
           button that is focusable, announced and inert is worse than no
           button, so it goes rather than staying as decoration. */
        if (!navigator.clipboard) { button.remove(); return; }

        var settle = null;

        button.addEventListener("click", function () {
            navigator.clipboard.writeText(block.dataset.copy || "").then(function () {
                block.classList.add("is-copied");
                announce("Copied to the clipboard.");
                /* Held, so a second press restarts the mark rather than
                   having the first press's timer clear the second's. */
                window.clearTimeout(settle);
                settle = window.setTimeout(function () {
                    block.classList.remove("is-copied");
                }, 1200);
            }, function () {
                announce("Could not copy. Select the command and copy it by hand.");
            });
        });
    });

    /* ------------------------------------------------------ the sleeves
     *
     * The six sleeves are SVG files the page already draws as CSS
     * backgrounds. Loading the same files into a canvas means the swatch being
     * measured is the artwork being shown rather than a second drawing of it.
     *
     * 232 is one of the app's own decode tiers, and the tier matters: the
     * sixty-four-pixel floor below is an absolute count, so it is about 1.2%
     * of a 72px thumbnail and 0.012% of a 720px hero.
     */
    var TIER = 232;

    var SLEEVES = [
        { file: "assets/images/sleeve-0.svg", title: "Lantern Season", artist: "Halve Moon" },
        { file: "assets/images/sleeve-1.svg", title: "Blue Hour", artist: "The Ninth Wave" },
        { file: "assets/images/sleeve-2.svg", title: "Paper Boats", artist: "Ivo Anhalt" },
        { file: "assets/images/sleeve-3.svg", title: "Cadence", artist: "Marta Reyes" },
        { file: "assets/images/sleeve-4.svg", title: "Sightlines", artist: "Oyster Club" },
        { file: "assets/images/sleeve-5.svg", title: "Winter Almanac", artist: "Field Notes" }
    ];

    /* artwork.rs's `dominant()`, unchanged. A plain arithmetic mean over the
       pixels that survive three tests — no histogram, no k-means, no palette
       step. `high` and `low` are the largest and smallest of the three
       channels, so `high - low` is chroma rather than saturation, which makes
       the grey test brightness-independent in a way a saturation test would
       not be. Alpha is never consulted. */
    function dominant(data) {
        var r = 0, g = 0, b = 0, kept = 0;
        var dark = 0, light = 0, grey = 0;
        var i, pr, pg, pb, high, low;

        for (i = 0; i < data.length; i += 4) {
            pr = data[i]; pg = data[i + 1]; pb = data[i + 2];
            high = pr > pg ? (pr > pb ? pr : pb) : (pg > pb ? pg : pb);
            low = pr < pg ? (pr < pb ? pr : pb) : (pg < pb ? pg : pb);

            /* Too dark or too bright to have a usable hue, or too close to
               grey to have one at all. */
            if (high < 40) { dark += 1; continue; }
            if (low > 232) { light += 1; continue; }
            if (high - low < 28) { grey += 1; continue; }

            r += pr; g += pg; b += pb; kept += 1;
        }

        var out = { kept: kept, dark: dark, light: light, grey: grey, tint: null };

        /* A handful of stray coloured pixels on a black-and-white sleeve is
           noise, not a colour. */
        if (kept < 64) { return out; }

        r /= kept; g /= kept; b /= kept;
        out.mean = [Math.round(r), Math.round(g), Math.round(b)];

        /* Lift the mean so its brightest channel lands on 190. All three
           channels are scaled equally, so hue and chroma ratio survive and
           only brightness moves — the point is a wash of the right hue and not
           a faithful reproduction. */
        var peak = Math.max(r, g, b, 1.0);
        out.lift = 190.0 / peak;
        out.tint = [
            Math.min(Math.round(r * out.lift), 255),
            Math.min(Math.round(g * out.lift), 255),
            Math.min(Math.round(b * out.lift), 255)
        ];
        return out;
    }

    function hex(rgb) {
        return "#" + rgb.map(function (c) {
            return ("0" + c.toString(16)).slice(-2);
        }).join("");
    }

    /* Load every sleeve, measure it once, and hand the results to whoever
       wants them. A failure anywhere — a canvas the browser will not let us
       read back, a file that does not arrive — leaves `measured` empty, and
       both callers fall back to what the markup already says. */
    var measured = [];

    function measureAll(done) {
        var pending = SLEEVES.length;
        var canvas = document.createElement("canvas");
        canvas.width = TIER;
        canvas.height = TIER;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });

        SLEEVES.forEach(function (sleeve, index) {
            var image = new Image();
            image.decoding = "async";
            image.onload = function () {
                try {
                    ctx.clearRect(0, 0, TIER, TIER);
                    ctx.drawImage(image, 0, 0, TIER, TIER);
                    var result = dominant(ctx.getImageData(0, 0, TIER, TIER).data);
                    result.image = image;
                    result.total = TIER * TIER;
                    measured[index] = result;
                } catch (e) {
                    /* Reading the canvas back is what fails on a file:// URL.
                       Nothing else here needs it. */
                }
                if (--pending === 0) { done(); }
            };
            image.onerror = function () {
                if (--pending === 0) { done(); }
            };
            image.src = sleeve.file;
        });
    }

    /* --------------------------------------------------------- the window */

    var win = document.getElementById("win");
    var list = document.getElementById("tracks");

    function tintOf(index, fallback) {
        var result = measured[index];
        if (result) { return result.tint ? hex(result.tint) : ""; }
        return fallback;
    }

    function paint(element, tint) {
        if (tint) {
            element.style.setProperty("--tint", tint);
            element.classList.add("has-tint");
        } else {
            /* A cover with no colour gets no tint rather than a dirty one, and
               a null result does not clear what is already there in the app —
               here it does, because the demo is about the difference. */
            element.classList.remove("has-tint");
        }
    }

    if (win && list) {
        var rows = Array.prototype.slice.call(list.querySelectorAll(".track"));
        var npArt = document.getElementById("npArt");
        var npTitle = document.getElementById("npTitle");
        var npArtist = document.getElementById("npArtist");
        var npBadge = document.getElementById("npBadge");
        var timeNow = document.getElementById("timeNow");
        var timeTotal = document.getElementById("timeTotal");
        var scrubFill = document.getElementById("scrubFill");
        var elapsed = 84;
        var duration = 238;

        function seconds(text) {
            var parts = text.split(":");
            return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
        }

        function clock(value) {
            var m = Math.floor(value / 60);
            var s = Math.floor(value % 60);
            return m + ":" + (s < 10 ? "0" : "") + s;
        }

        function draw() {
            timeNow.textContent = clock(elapsed);
            scrubFill.style.width = ((elapsed / duration) * 100).toFixed(2) + "%";
        }

        draw();

        function select(row) {
            rows.forEach(function (other) {
                var on = other === row;
                other.classList.toggle("is-live", on);
                other.setAttribute("aria-selected", String(on));
                other.tabIndex = on ? 0 : -1;
            });

            var index = parseInt(row.dataset.sleeve, 10);
            npArt.dataset.sleeve = row.dataset.sleeve;
            npTitle.textContent = row.dataset.title;
            npArtist.textContent = row.dataset.artist;
            var badge = row.querySelector(".badge");
            npBadge.textContent = badge ? badge.textContent : "";
            npBadge.hidden = !badge;

            duration = seconds(row.dataset.length);
            elapsed = 0;
            timeTotal.textContent = row.dataset.length;
            draw();

            paint(win, tintOf(index, row.dataset.tint));
        }

        list.addEventListener("click", function (event) {
            var row = event.target.closest(".track");
            if (row) { select(row); }
        });

        /* Arrow keys move the selection, the way the queue does. */
        list.addEventListener("keydown", function (event) {
            var row = event.target.closest(".track");
            if (!row) { return; }
            var at = rows.indexOf(row);
            var next = null;

            if (event.key === "ArrowDown") { next = rows[at + 1]; }
            else if (event.key === "ArrowUp") { next = rows[at - 1]; }
            else if (event.key === "Home") { next = rows[0]; }
            else if (event.key === "End") { next = rows[rows.length - 1]; }
            else if (event.key === "Enter" || event.key === " ") { next = row; }
            else { return; }

            event.preventDefault();
            if (next) { select(next); next.focus(); }
        });

        /* The transport clock. It is the one thing on this page that moves on
           its own, so it stops for anyone who has asked for less motion, and
           when the window is off screen. */
        var playing = true;
        var pause = document.getElementById("playPause");

        if (pause) {
            pause.addEventListener("click", function () {
                playing = !playing;
                win.classList.toggle("is-paused", !playing);
                pause.setAttribute("aria-label", playing ? "Pause" : "Play");
            });
        }

        var visible = true;
        if (window.IntersectionObserver) {
            new IntersectionObserver(function (entries) {
                visible = entries[0].isIntersecting;
            }, { threshold: 0 }).observe(win);
        }

        window.setInterval(function () {
            if (reduced.matches || !playing || !visible || document.hidden) { return; }
            elapsed = elapsed + 1 > duration ? 0 : elapsed + 1;
            draw();
        }, 1000);

        /* The player list, opening upward off the pill. */
        var pill = document.getElementById("playerPill");
        var pop = document.getElementById("playersPop");

        if (pill && pop) {
            var setOpen = function (open) {
                pop.hidden = !open;
                pill.setAttribute("aria-expanded", String(open));
            };

            pill.addEventListener("click", function (event) {
                event.stopPropagation();
                setOpen(pop.hidden);
            });
            document.addEventListener("click", function (event) {
                if (!pop.hidden && !pop.contains(event.target)) { setOpen(false); }
            });
            document.addEventListener("keydown", function (event) {
                if (event.key === "Escape" && !pop.hidden) { setOpen(false); pill.focus(); }
            });
        }
    }

    /* ------------------------------------------------------------ the lab */

    var lab = document.getElementById("lab");

    if (lab) {
        var swatches = Array.prototype.slice.call(lab.querySelectorAll(".swatch"));
        var cover = document.getElementById("labCover");
        var card = document.getElementById("labCard");
        var out = {
            dark: document.getElementById("cutDark"),
            light: document.getElementById("cutLight"),
            grey: document.getElementById("cutGrey"),
            keep: document.getElementById("cutKeep"),
            mean: document.getElementById("labMean"),
            lift: document.getElementById("labLift"),
            tint: document.getElementById("labTint"),
            title: document.getElementById("labTitle"),
            artist: document.getElementById("labArtist"),
            note: document.getElementById("labNote")
        };

        var share = function (n, total) {
            return n.toLocaleString() + " (" + Math.round((n / total) * 100) + "%)";
        };

        var show = function (index) {
            var sleeve = SLEEVES[index];
            var result = measured[index];

            swatches.forEach(function (swatch) {
                var on = parseInt(swatch.dataset.sleeve, 10) === index;
                swatch.classList.toggle("is-on", on);
                swatch.setAttribute("aria-checked", String(on));
                swatch.tabIndex = on ? 0 : -1;
            });

            out.title.textContent = sleeve.title;
            out.artist.textContent = sleeve.artist;

            if (!result) {
                out.note.textContent = "The sleeves could not be read back from"
                    + " the canvas here, so there are no figures to show. The"
                    + " arithmetic is in artwork.rs either way.";
                return;
            }

            /* The background carries the no-script case; keep it in step so
               the two never show different sleeves. An inline style resolves
               against the document rather than the stylesheet, so this is the
               path as index.html would write it. */
            cover.style.backgroundImage = 'url("' + sleeve.file + '")';
            if (cover.getContext && result.image) {
                var cc = cover.getContext("2d");
                cc.clearRect(0, 0, cover.width, cover.height);
                cc.drawImage(result.image, 0, 0, cover.width, cover.height);
            }

            out.dark.textContent = share(result.dark, result.total);
            out.light.textContent = share(result.light, result.total);
            out.grey.textContent = share(result.grey, result.total);
            out.keep.textContent = share(result.kept, result.total);

            if (result.tint) {
                out.mean.textContent = "rgb(" + result.mean.join(", ") + ")";
                out.lift.textContent = "×" + result.lift.toFixed(3)
                    + (result.lift >= 1 ? " (brighter)" : " (darker)");
                out.tint.textContent = hex(result.tint);
                out.note.textContent = "The mean is lifted so its brightest"
                    + " channel lands on 190 — all three scaled equally, so only"
                    + " brightness moves and the hue survives.";
                paint(card, hex(result.tint));
            } else {
                out.mean.textContent = "—";
                out.lift.textContent = "—";
                out.tint.textContent = "none";
                out.note.textContent = "Fewer than sixty-four pixels survived,"
                    + " which is noise rather than a colour. The panel draws its"
                    + " ordinary self — no fallback grey, no desaturated average,"
                    + " nothing.";
                paint(card, "");
            }
        };

        swatches.forEach(function (swatch) {
            swatch.addEventListener("click", function () {
                show(parseInt(swatch.dataset.sleeve, 10));
            });
        });

        /* A radiogroup is arrowed through rather than tabbed through, and only
           the chosen one is in the tab order. Without this the six sleeves are
           six tab stops that announce themselves as radios and then do not
           behave like any. */
        lab.querySelector(".lab-sleeves").addEventListener("keydown", function (event) {
            var at = swatches.indexOf(event.target);
            if (at < 0) { return; }
            var to = null;

            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                to = (at + 1) % swatches.length;
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                to = (at - 1 + swatches.length) % swatches.length;
            } else if (event.key === "Home") {
                to = 0;
            } else if (event.key === "End") {
                to = swatches.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            show(parseInt(swatches[to].dataset.sleeve, 10));
            swatches[to].focus();
        });

        /* Paint the six swatches from the files themselves, so the thing being
           clicked is the thing being measured. */
        var drawSwatches = function () {
            swatches.forEach(function (swatch) {
                var index = parseInt(swatch.dataset.sleeve, 10);
                var canvas = swatch.querySelector("canvas");
                var result = measured[index];
                if (!canvas || !canvas.getContext || !result || !result.image) { return; }
                var ctx = canvas.getContext("2d");
                ctx.drawImage(result.image, 0, 0, canvas.width, canvas.height);
            });
        };

        measureAll(function () {
            drawSwatches();
            show(0);
            /* The window was painted from the markup's own tint until now;
               repaint it from the pixels. */
            var live = list && list.querySelector(".track.is-live");
            if (win && live) {
                paint(win, tintOf(parseInt(live.dataset.sleeve, 10), live.dataset.tint));
            }
        });
    }
}());
