const tabs = new Set(['home', 'songs', 'scores', 'stage', 'rehearsal', 'memories', 'favorites', 'recent', 'settings']);

export function readRoute() {
  const query = new URL(location.href).searchParams;
  return {tab: tabs.has(query.get('tab')) ? query.get('tab') : 'home', song: query.get('song') || null, part: query.get('part') || null};
}

export function routeUrl(route) {
  const url = new URL('./index.html', location.href);
  if (route.song) {
    url.searchParams.set('song', route.song);
    if (route.part) url.searchParams.set('part', route.part);
  } else if (route.tab && route.tab !== 'home') url.searchParams.set('tab', route.tab);
  return url;
}

export function writeRoute(route, {replace = false} = {}) {
  history[replace ? 'replaceState' : 'pushState']({acaroom: true}, '', routeUrl(route));
}
