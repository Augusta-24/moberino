/* Static Journey configuration. Runtime state stores IDs and never mutates
   these route definitions. */
(function () {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const REGIONS = [
    {
      id: 'region-1',
      name: 'Home Orbit & Scrap Belt',
      chapter: 'Chapter One: Get Out of Town'
    }
  ];

  const TRANSMISSIONS = [
    {
      id: 'scrap-belt-signals',
      source: 'WAYFARER SIGNAL ARRAY',
      title: 'TWO SIGNALS BEYOND THE BELT',
      body: 'One is a live distress beacon. The other is an old supply-cache ping. We have fuel for either course.',
      prompt: "PILOT'S CALL",
      leads: [
        { nodeId: 'distress-signal', label: 'ANSWER THE BEACON', detail: 'Someone may still be alive.' },
        { nodeId: 'abandoned-cache', label: 'CHECK THE CACHE', detail: 'Safer. Useful supplies.' }
      ]
    }
  ];

  const ROUTE_NODES = [
    {
      id: 'home-orbit',
      regionId: 'region-1',
      name: 'Home Orbit',
      shortName: 'HOME',
      type: 'safe',
      description: 'Your starting point. No station services.',
      connections: ['fuel-stop-1'],
      fuelCost: 0,
      distance: 0,
      implemented: true
    },
    {
      id: 'fuel-stop-1',
      regionId: 'region-1',
      name: 'Lantern Station',
      shortName: 'LANTERN',
      type: 'peaceful',
      description: 'Refuel. Unlock the Scrap Belt.',
      connections: ['home-orbit', 'scrap-belt'],
      fuelCost: 6,
      distance: 18,
      implemented: true
    },
    {
      id: 'scrap-belt',
      regionId: 'region-1',
      name: 'Scrap Belt',
      shortName: 'SCRAP BELT',
      type: 'encounter',
      description: 'Break debris. Gather salvage.',
      connections: ['fuel-stop-1', 'distress-signal', 'abandoned-cache'],
      fuelCost: 8,
      distance: 34,
      implemented: true,
      encounterId: 'asteroid-salvage-1'
    },
    {
      id: 'distress-signal',
      regionId: 'region-1',
      name: 'Distress Signal',
      shortName: 'DISTRESS',
      type: 'rescue',
      description: 'Stabilize a tumbling pod and bring Pip aboard.',
      connections: ['scrap-belt', 'repair-moon'],
      fuelCost: 7,
      distance: 29,
      implemented: true,
      encounterId: 'rescue-beacon-1',
      passengerId: 'pip'
    },
    {
      id: 'abandoned-cache',
      regionId: 'region-1',
      name: 'Abandoned Cache',
      shortName: 'CACHE',
      type: 'peaceful',
      description: 'Optional supplies off the main route.',
      connections: ['scrap-belt', 'repair-moon'],
      fuelCost: 5,
      distance: 22,
      implemented: true
    },
    {
      id: 'repair-moon',
      regionId: 'region-1',
      name: 'Repair Moon',
      shortName: 'REPAIR',
      type: 'safe',
      description: 'Repair and upgrade the ship.',
      connections: ['distress-signal', 'abandoned-cache', 'ogre-gate'],
      fuelCost: 7,
      distance: 31,
      implemented: true
    },
    {
      id: 'ogre-gate',
      regionId: 'region-1',
      name: 'Ogre Gate',
      shortName: 'OGRE GATE',
      type: 'boss',
      description: 'A guardian blocks the passage.',
      connections: ['repair-moon', 'first-settlement'],
      fuelCost: 12,
      distance: 46,
      implemented: false
    },
    {
      id: 'first-settlement',
      regionId: 'region-1',
      name: 'First Settlement',
      shortName: 'SETTLEMENT',
      type: 'destination',
      description: 'Safe harbor beyond the home route.',
      connections: ['ogre-gate'],
      fuelCost: 5,
      distance: 20,
      implemented: false
    }
  ];

  const NODE_BY_ID = ROUTE_NODES.reduce((map, node) => {
    map[node.id] = node;
    return map;
  }, {});
  const TRANSMISSION_BY_ID = TRANSMISSIONS.reduce((map, transmission) => {
    map[transmission.id] = transmission;
    return map;
  }, {});

  function getNode(id) {
    return NODE_BY_ID[id] || null;
  }

  function getRegion(id) {
    return REGIONS.find(region => region.id === id) || null;
  }

  function getConnectedNodes(id) {
    const node = getNode(id);
    return node ? node.connections.map(getNode).filter(Boolean) : [];
  }

  function getTransmission(id) {
    return TRANSMISSION_BY_ID[id] || null;
  }

  window.JourneyData = deepFreeze({
    regions: REGIONS,
    routeNodes: ROUTE_NODES,
    transmissions: TRANSMISSIONS,
    getNode,
    getRegion,
    getConnectedNodes,
    getTransmission
  });
})();
