/* Packing Game's cumulative, data-driven mechanic contract. */
(function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    board: Object.freeze({ topology: 'rectangle-holes', minHoles: 0, maxHoles: 0 }),
    links: Object.freeze({ enabled: false, count: 0 }),
    overlaps: Object.freeze({ enabled: false, count: 0 }),
    anchors: Object.freeze({ enabled: false, count: 0, linkedGroups: 0 }),
    overlapZone: Object.freeze({ enabled: false, minCells: 0, maxCells: 0 }),
    surplus: Object.freeze({ enabled: false, count: 0 }),
    utilities: Object.freeze({ enabled: false, tools: Object.freeze([]) }),
    expansion: Object.freeze({ enabled: false, lockedRegions: 0 })
  });

  function normalize(input) {
    const value = input || {};
    const minHoles = Math.max(0, Math.round(Number(value.board && value.board.minHoles) || 0));
    const maxHoles = Math.max(minHoles, Math.round(Number(value.board && value.board.maxHoles) || 0));
    const tools = Array.isArray(value.utilities && value.utilities.tools)
      ? value.utilities.tools.map(tool => Object.freeze({ ...tool }))
      : [];
    return Object.freeze({
      board: Object.freeze({
        ...DEFAULTS.board,
        ...(value.board || {}),
        minHoles,
        maxHoles
      }),
      links: Object.freeze({
        ...DEFAULTS.links,
        ...(value.links || {}),
        count: Math.max(0, Math.round(Number(value.links && value.links.count) || 0))
      }),
      overlaps: Object.freeze({
        ...DEFAULTS.overlaps,
        ...(value.overlaps || {}),
        count: Math.max(0, Math.round(Number(value.overlaps && value.overlaps.count) || 0))
      }),
      anchors: Object.freeze({
        ...DEFAULTS.anchors,
        ...(value.anchors || {}),
        count: Math.max(0, Math.round(Number(value.anchors && value.anchors.count) || 0)),
        linkedGroups: Math.max(0, Math.round(Number(value.anchors && value.anchors.linkedGroups) || 0))
      }),
      overlapZone: Object.freeze({
        ...DEFAULTS.overlapZone,
        ...(value.overlapZone || {}),
        minCells: Math.max(0, Math.round(Number(value.overlapZone && value.overlapZone.minCells) || 0)),
        maxCells: Math.max(0, Math.round(Number(value.overlapZone && value.overlapZone.maxCells) || 0))
      }),
      surplus: Object.freeze({
        ...DEFAULTS.surplus,
        ...(value.surplus || {}),
        count: Math.max(0, Math.round(Number(value.surplus && value.surplus.count) || 0))
      }),
      utilities: Object.freeze({ ...DEFAULTS.utilities, ...(value.utilities || {}), tools: Object.freeze(tools) }),
      expansion: Object.freeze({
        ...DEFAULTS.expansion,
        ...(value.expansion || {}),
        lockedRegions: Math.max(0, Math.round(Number(value.expansion && value.expansion.lockedRegions) || 0))
      })
    });
  }

  window.PackingGameMechanics = Object.freeze({ defaults: DEFAULTS, normalize });
})();
