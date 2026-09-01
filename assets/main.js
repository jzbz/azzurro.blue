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

    /* --------------------------------------------------------- the window */

    var win = document.getElementById("win");
    var list = document.getElementById("tracks");

    /* The tint each sleeve carries, as the markup states it.
     *
     * This used to prefer a value measured from the sleeve's own pixels, with
     * the markup as fallback — but the only thing that ran the measuring was
     * the colour lab, and that section is gone. The fallback was therefore the
     * whole behaviour already; this says so instead of reading an array
     * nothing fills. */
    function tintOf(index, fallback) {
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

}());
