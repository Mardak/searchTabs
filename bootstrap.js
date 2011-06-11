/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Search Tabs.
 *
 * The Initial Developer of the Original Code is Edward Lee.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@gmail.com>
 *   Margaret Leibovic <margaret.leibovic@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
const global = this;

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Remember various offsets enough to hide tabs + shadow or show them
const OFFSETS = {
  hidden: -100,
  partial: -64,
  shown: 0,
};

// Add search tabs that allow searching with installed search engines
function addSearchTabs(window) {
  let {async, createNode, getDominantColor, listen, unload} = makeWindowHelpers(window);
  let {document, gBrowser} = window;

  // Create a box for tabs that sit near the bottom of the screen
  let tabs = createNode("hbox");
  tabs.setAttribute("bottom", 0);
  tabs.setAttribute("left", 0);
  tabs.setAttribute("right", 0);

  tabs.style.height = "96px";
  tabs.style.pointerEvents = "none";

  // Move the box to the current tab
  tabs.move = function() {
    gBrowser.selectedBrowser.parentNode.appendChild(tabs);
  };
  tabs.move();

  // Initially everything is shown
  tabs.offset = OFFSETS.shown;

  // Shift all the tabs to a desired offset
  tabs.shiftAll = function(offset) {
    tabs.offset = offset;
    Array.forEach(tabs.childNodes, function(tab) tab.shift(offset));
  };

  // Clean up when necessary
  unload(function() tabs.parentNode.removeChild(tabs));

  // Make sure the tabs are on the current browser stack
  listen(gBrowser.tabContainer, "TabSelect", function() tabs.move());

  // Create search tabs based on the installed search engines
  Services.search.getEngines().forEach(function(engine) {
    let tab = createNode("box");
    tab.setAttribute("flex", 1);
    tab.setAttribute("pack", "center");
    tabs.appendChild(tab);

    tab.style.backgroundColor = "white";
    tab.style.borderRadius = "10px 10px 0 0";
    tab.style.padding = "32px 0";
    tab.style.pointerEvents = "auto";

    // Shift and change the transparency based on how much to offset
    tab.offset = function(offset) {
      tab.style.marginBottom = offset + "px";
      tab.style.marginTop = -offset + "px";
      tab.style.opacity = (offset - OFFSETS.hidden) / -OFFSETS.hidden;
    };

    // Animate a shift to some offset
    tab.shift = function(target) {
      // Cancel out any previous animations
      if (tab.shifter != null)
        tab.shifter();

      // Remember where we started
      let from = parseInt(tab.style.marginBottom) || 0;

      // Keep track of the animation progress
      let startTime = Date.now();

      // Do all steps on a timer so that show-hide-show won't flicker
      (function shiftStep() tab.shifter = async(function() {
        // Start a little slow then speed up
        let step = Math.pow(Math.min(1, (Date.now() - startTime) / 150), 1.5);

        // Figure out how much to show based on where we started
        tab.offset(from + (target - from) * step);

        // Prepare the next step of the animation
        if (step < 1)
          shiftStep();
        // Otherwise we're done!
        else
          tab.shifter = null;
      }))();
    }

    // Do a search with whatever value we have
    tab.addEventListener("click", function() {
      // Don't bother if tabs are already hidden
      if (tabs.offset == OFFSETS.hidden)
        return;

      // Shift everything away now that we're loading
      tabs.shiftAll(OFFSETS.hidden);

      // Open the search url in a tab
      let url = engine.getSubmission(checker.value).uri.spec;
      if (!window.isTabEmpty(gBrowser.selectedTab)) {
        window.openUILinkIn(url, "tab");
        return;
      }

      // Just show the search in the current empty tab
      let {selectedBrowser} = gBrowser;
      selectedBrowser.loadURI(url);
      selectedBrowser.focus();
    }, false);

    // Reset the offset to where others are
    tab.addEventListener("mouseout", function() {
      tab.shift(tabs.offset);
    }, false);

    // Show the tab sticking out if it's not supposed to be hidden
    tab.addEventListener("mouseover", function() {
      if (tabs.offset != OFFSETS.hidden)
        tab.shift(OFFSETS.shown);
    }, false);

    // Add the search icon in the center of the tab
    let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
    img.setAttribute("src", engine.iconURI.spec);
    tab.appendChild(img);

    img.style.display = "block";
    img.style.height = "32px";
    img.style.pointerEvents = "none";
    img.style.width = "32px";

    // Wait for the image to load to detect colors
    img.addEventListener("load", function() {
      let color = getDominantColor(img);
      function rgb(a) "rgba(" + color + "," + a +")";

      // Set a radial gradient that makes use of the dominant color
      let gradient = ["top left", "farthest-corner", rgb(.3), rgb(.5)];
      tab.style.backgroundImage = "-moz-radial-gradient(" + gradient + ")";

      // Add a border with the dominant color
      tab.style.boxShadow = "0 0 20px " + rgb(1) + " inset, 0 0 5px black";
    }, false);
  });

  // Display the icons for a little on startup then hide
  async(function() {
    // Only hide if still showing everything
    if (tabs.offset == OFFSETS.shown)
      tabs.shiftAll(OFFSETS.hidden);
  }, 5000);

  // Handle events by checking if search tabs should show
  function checker({originalTarget}) {
    // Merge multiple checks into one
    if (checker.timer != null)
      return;

    // Delay checking just a little bit to allow for merging
    checker.timer = async(function() {
      checker.timer = null;

      // Figure out if there's any selected text in the appropriate context
      let doc = originalTarget.ownerDocument;
      let targetWindow = (doc == null ? null : doc.defaultView) || window;

      // Prefer the selection text over focused if we have something
      let selection = String.trim(targetWindow.getSelection());
      if (selection != "") {
        tabs.shiftAll(OFFSETS.partial);
        checker.value = selection;
        return;
      }

      // Check if an input box is selected with text
      let {focusedElement} = document.commandDispatcher;
      let {nodeName, type, value} = focusedElement || {};
      if (nodeName == null ||
          nodeName.search(/^(html:)?input$/i) == -1 ||
          type.search(/^text$/i) == -1) {
        tabs.shiftAll(OFFSETS.hidden);
        return;
      }

      tabs.shiftAll(value == "" ? OFFSETS.hidden : OFFSETS.partial);
      checker.value = value;
    }, 100);
  }

  // Look for various events to detect focus or selection change
  listen(window, "focus", checker);
  listen(window, "keyup", checker);
  listen(window, "mouseup", checker);
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  // Load various javascript includes for helper functions
  ["helper", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Add search tabs with colors
  watchWindows(addSearchTabs);
})


/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
