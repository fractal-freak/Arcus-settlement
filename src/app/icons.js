// Original geometric interface drawings; no font glyphs or external assets.
const paths = {
  journal: '<path d="M4 4h6c1 0 2 1 2 2v14c0-1-1-2-2-2H4zM20 4h-6c-1 0-2 1-2 2v14c0-1 1-2 2-2h6z"/>',
  sound: '<path d="M4 10h4l5-4v12l-5-4H4zM17 8c2 2 2 6 0 8M20 5c4 4 4 10 0 14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  person: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  left: '<path d="M4 9h9a7 7 0 0 1 7 7M8 5 4 9l4 4"/>',
  right: '<path d="M20 9h-9a7 7 0 0 0-7 7M16 5l4 4-4 4"/>',
  minus: '<path d="M6 12h12"/>', plus: '<path d="M6 12h12M12 6v12"/>',
  chat: '<path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3zM8 8h8M8 12h5"/>',
};
export function icon(name) { return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.compass}</svg>`; }
export function mountInterface() {
  const tools=document.createElement('nav');tools.id='world-tools';tools.setAttribute('aria-label','World menus');
  document.body.append(tools);
  const journal=document.getElementById('journal-toggle'), sounds=document.getElementById('sound-settings');
  journal.innerHTML=icon('journal')+'<span>Journal</span>';
  sounds.innerHTML=icon('sound')+'<span>Sound</span>';
  tools.append(journal,sounds);
  const crew=document.getElementById('crew-menu');if(crew)tools.append(crew);
  document.getElementById('sound-panel').querySelector('header').after(document.getElementById('sound'));
  for (const [id,name] of [['camLeft','left'],['camRight','right'],['camHome','compass'],['camOut','minus'],['camIn','plus']]) document.getElementById(id).innerHTML=icon(name);
  for(const selector of ['.journal-close','#sound-close','.conversation-close']) document.querySelector(selector).innerHTML=icon('close');
}
