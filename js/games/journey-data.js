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

  const ROUTE_NODES = [
    {
      id: 'home-orbit',
      regionId: 'region-1',
      name: 'Home Orbit',
      shortName: 'HOME',
      type: 'safe',
      description: 'A quiet orbit and the last familiar view.',
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
      description: 'A roadside fuel station with enough propellant to leave home behind.',
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
      description: 'Old wreckage drifts across the route. Salvage is mixed with danger.',
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
      description: 'A weak transmission repeats from beyond the debris.',
      connections: ['scrap-belt', 'repair-moon'],
      fuelCost: 7,
      distance: 29,
      implemented: false
    },
    {
      id: 'abandoned-cache',
      regionId: 'region-1',
      name: 'Abandoned Cache',
      shortName: 'CACHE',
      type: 'peaceful',
      description: 'An optional detour toward an unclaimed supply cache.',
      connections: ['scrap-belt', 'repair-moon'],
      fuelCost: 5,
      distance: 22,
      implemented: false
    },
    {
      id: 'repair-moon',
      regionId: 'region-1',
      name: 'Repair Moon',
      shortName: 'REPAIR',
      type: 'safe',
      description: 'A small maintenance settlement beneath an old relay.',
      connections: ['distress-signal', 'abandoned-cache', 'ogre-gate'],
      fuelCost: 7,
      distance: 31,
      implemented: false
    },
    {
      id: 'ogre-gate',
      regionId: 'region-1',
      name: 'Ogre Gate',
      shortName: 'OGRE GATE',
      type: 'boss',
      description: 'A guarded passage blocks the way to the first settlement.',
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
      description: 'The first safe harbor beyond the home route.',
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

  window.JourneyData = deepFreeze({
    regions: REGIONS,
    routeNodes: ROUTE_NODES,
    getNode,
    getRegion,
    getConnectedNodes
  });
})();
