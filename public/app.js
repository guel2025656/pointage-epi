(function () {
  var state = { secteurs: [], acteurs: [], sitesIndex: {}, token: localStorage.getItem('epi_token') || null,
                admin: JSON.parse(localStorage.getItem('epi_admin') || 'null') };
  var params = new URLSearchParams(location.search);
  var urlSite = params.get('site');
  var urlLat = params.get('lat');
  var urlLng = params.get('lng');

  function todayStr(){ var d=new Date(); return d.toISOString().slice(0,10); }
  function nowTime(){ var d=new Date(); return d.toTimeString().slice(0,5); }

  function authHeaders(){
    var h = {'Content-Type':'application/json'};
    if(state.token) h['Authorization'] = 'Bearer '+state.token;
    return h;
  }
  async function apiGet(path){
    var res = await fetch(path, { headers: authHeaders() });
    if(!res.ok) throw await res.json().catch(function(){return {error:'Erreur réseau'};});
    return res.json();
  }
  async function apiSend(path, method, body){
    var res = await fetch(path, { method: method, headers: authHeaders(), body: JSON.stringify(body||{}) });
    var data = await res.json().catch(function(){return {};});
    if(!res.ok) throw data;
    return data;
  }

  // ---------- Paquet hors-ligne (secteurs/sites/acteurs + PIN hachés) ----------
  function getOfflineBundle(){ try{ return JSON.parse(localStorage.getItem('epi_offline_bundle')||'null'); }catch(e){ return null; } }
  function setOfflineBundle(b){ localStorage.setItem('epi_offline_bundle', JSON.stringify(b)); renderOfflineStatus(); }
  function renderOfflineStatus(){
    var el = document.getElementById('offlineStatus');
    if(!el) return;
    var b = getOfflineBundle();
    if(!b){ el.textContent = 'Aucune donnée hors-ligne enregistrée sur cet appareil.'; return; }
    var d = new Date(b.genereLe);
    el.textContent = b.acteurs.length+' acteurs disponibles hors-ligne (téléchargés le '+d.toLocaleDateString('fr-FR')+' à '+d.toLocaleTimeString('fr-FR').slice(0,5)+').';
  }
  async function telechargerPourHorsLigne(){
    var statusEl = document.getElementById('offlineStatus');
    try{
      var bundle = await apiGet('/api/offline/bundle');
      setOfflineBundle(bundle);
    }catch(e){
      statusEl.className = 'muted';
      statusEl.textContent = (getOfflineBundle() ? 'Mise à jour impossible (hors-ligne) — ' : 'Téléchargement impossible — ') + 'vérifiez votre connexion et réessayez.';
    }
  }
  var btnTelecharger = document.getElementById('btnTelechargerHorsLigne');
  if(btnTelecharger) btnTelecharger.addEventListener('click', telechargerPourHorsLigne);

  var RAYON_TOLERANCE_METRES = 150;
  function distanceMetres(lat1, lng1, lat2, lng2){
    var R = 6371000, toRad = function(d){ return d*Math.PI/180; };
    var dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  function verifierPresenceLocale(site, lat, lng){
    if(!site || site.latitude==null || site.longitude==null) return null;
    if(lat==null || lng==null) return "La géolocalisation est requise pour pointer sur ce site. Activez-la puis réessayez.";
    var d = distanceMetres(site.latitude, site.longitude, lat, lng);
    if(d > RAYON_TOLERANCE_METRES) return 'Vous semblez trop loin du site ('+Math.round(d)+' m) pour pointer. Rapprochez-vous puis réessayez.';
    return null;
  }

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
      document.querySelectorAll('.panel').forEach(function(x){x.classList.remove('active');});
      t.classList.add('active');
      document.getElementById('panel-'+t.dataset.tab).classList.add('active');
      if(t.dataset.tab==='dashboard' && state.token) loadDashboard();
      if(t.dataset.tab==='absences' && state.token) loadAbsences();
    });
  });

  // ---------- Offline queue ----------
  function getQueue(){ try{ return JSON.parse(localStorage.getItem('epi_queue')||'[]'); }catch(e){ return []; } }
  function setQueue(q){ localStorage.setItem('epi_queue', JSON.stringify(q)); renderQueue(); }
  function renderQueue(){
    var q = getQueue();
    var card = document.getElementById('queueCard');
    if(!q.length){ card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    document.getElementById('queueList').innerHTML = q.map(function(it){
      return '<div class="pill">'+it.type+' — '+it.date+' '+it.heure+'</div>';
    }).join('');
  }
  async function trySyncQueue(){
    if(!navigator.onLine) return;
    var q = getQueue();
    if(!q.length) return;
    var remaining = [];
    for(var i=0;i<q.length;i++){
      var it = q[i];
      try{
        await apiSend('/api/pointages/'+it.type, 'POST', {
          acteurId: it.acteurId, pin: it.pin, date: it.date, heure: it.heure,
          lat: it.lat, lng: it.lng, creeHorsLigne: true
        });
      }catch(e){
        var msg = (e && e.error) || '';
        // erreur définitive (mauvais PIN, trop loin du site) : on n'insiste pas indéfiniment
        if(!/PIN|loin|géolocalisation/i.test(msg)) remaining.push(it);
      }
    }
    setQueue(remaining);
    if(remaining.length < q.length) renderMesPointages();
  }
  window.addEventListener('online', trySyncQueue);
  window.addEventListener('online', function(){ telechargerPourHorsLigne().catch(function(){}); });

  function getGeoloc(){
    return new Promise(function(resolve, reject){
      if(!navigator.geolocation){ reject(new Error("Votre navigateur ne permet pas la géolocalisation.")); return; }
      navigator.geolocation.getCurrentPosition(
        function(pos){ resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}); },
        function(){ reject(new Error("Impossible d'obtenir votre position. Activez la géolocalisation (GPS) et autorisez l'accès, puis réessayez.")); },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }

  // ---------- Selects ----------
  function fillSelect(id, items, placeholder){
    var sel = document.getElementById(id);
    var current = sel.value;
    sel.innerHTML = '<option value="">'+placeholder+'</option>' + items.map(function(i){
      return '<option value="'+i.id+'">'+i.nom+'</option>';
    }).join('');
    if(items.find(function(i){return i.id===current;})) sel.value = current;
  }

  async function loadSecteurs(){
    try{
      state.secteurs = await apiGet('/api/secteurs');
    }catch(e){
      var b = getOfflineBundle();
      if(!b) throw e;
      state.secteurs = b.secteurs;
    }
    fillSelect('p-secteur', state.secteurs, 'Tous les secteurs');
    fillSelect('d-secteur', state.secteurs, 'Tous');
    fillSelect('a-secteur', state.secteurs, 'Tous les secteurs');
    fillSelect('n-secteur', state.secteurs, 'Choisir');
    fillSelect('n-site-secteur', state.secteurs, 'Choisir');
  }
  async function loadSites(secteurId, targetId, placeholder){
    var sites;
    try{
      sites = await apiGet('/api/sites'+(secteurId?('?secteurId='+secteurId):''));
    }catch(e){
      var b = getOfflineBundle();
      if(!b) throw e;
      sites = b.sites.filter(function(s){ return !secteurId || s.secteurId===secteurId; });
    }
    state.sitesIndex = state.sitesIndex || {};
    sites.forEach(function(s){ state.sitesIndex[s.id] = s; });
    fillSelect(targetId, sites, placeholder);
    return sites;
  }
  async function loadActeurs(secteurId, siteId){
    var qs = [];
    if(secteurId) qs.push('secteurId='+secteurId);
    if(siteId) qs.push('siteId='+siteId);
    try{
      state.acteurs = await apiGet('/api/acteurs'+(qs.length?('?'+qs.join('&')):''));
    }catch(e){
      var b = getOfflineBundle();
      if(!b) throw e;
      state.acteurs = b.acteurs.filter(function(a){
        return (!secteurId || a.secteurId===secteurId) && (!siteId || a.siteId===siteId);
      });
    }
    var sel = document.getElementById('p-acteur');
    sel.innerHTML = '<option value="">Sélectionnez votre nom</option>' + state.acteurs.map(function(a){
      return '<option value="'+a.id+'">'+a.nom+' — '+roleLabel(a.role)+'</option>';
    }).join('');
  }
  function roleLabel(r){
    return {ENSEIGNANT_ITINERANT:'Enseignant itinérant',VOLONTAIRE:'Volontaire',CANEF:'CANEF',CPPP:'CPPP',IEPP:'IEPP'}[r]||r;
  }

  document.getElementById('p-secteur').addEventListener('change', async function(){
    await loadSites(this.value, 'p-site', 'Tous les sites');
    await loadActeurs(this.value, document.getElementById('p-site').value);
  });
  document.getElementById('p-site').addEventListener('change', function(){
    loadActeurs(document.getElementById('p-secteur').value, this.value);
  });
  document.getElementById('a-secteur').addEventListener('change', async function(){
    var sites = await loadSites(this.value, 'a-acteur', 'Sélectionnez un acteur'); // temp, replaced below
    var acteurs = await apiGet('/api/acteurs'+(this.value?('?secteurId='+this.value):''));
    var sel = document.getElementById('a-acteur');
    sel.innerHTML = '<option value="">Sélectionnez un acteur</option>' + acteurs.map(function(a){
      return '<option value="'+a.id+'">'+a.nom+' — '+roleLabel(a.role)+'</option>';
    }).join('');
  });

  // ---------- PIN modal ----------
  var pendingAction = null;
  function openPinModal(acteur, type){
    pendingAction = { acteur: acteur, type: type };
    document.getElementById('pinModalActeur').textContent = acteur.nom+' — '+(type==='arrivee'?'Enregistrer mon arrivée':'Enregistrer mon départ');
    document.getElementById('pinInput').value = '';
    document.getElementById('pinModalStatus').innerHTML = '';
    document.getElementById('pinModal').classList.remove('hidden');
    document.getElementById('pinInput').focus();
  }
  function closePinModal(){ document.getElementById('pinModal').classList.add('hidden'); pendingAction = null; }
  document.getElementById('pinCancel').addEventListener('click', closePinModal);
  document.getElementById('pinConfirm').addEventListener('click', async function(){
    if(!pendingAction) return;
    var pin = document.getElementById('pinInput').value.trim();
    var statusEl = document.getElementById('pinModalStatus');
    if(!/^\d{4}$/.test(pin)){ statusEl.className='status err'; statusEl.textContent='Entrez les 4 chiffres de votre code.'; return; }
    statusEl.className='status info'; statusEl.textContent='Localisation en cours… (nécessaire pour confirmer que vous êtes sur le site)';
    var geo;
    try{
      geo = await getGeoloc();
    }catch(geoErr){
      statusEl.className='status err'; statusEl.textContent = geoErr.message;
      return;
    }
    var acteur = pendingAction.acteur, type = pendingAction.type;
    var payload = { acteurId: acteur.id, pin: pin, date: todayStr(), heure: nowTime(), lat: geo.lat, lng: geo.lng };
    if(!navigator.onLine){
      // Hors-ligne : on vérifie le PIN et la géolocalisation localement, avec les
      // données téléchargées à l'avance, pour donner un retour immédiat à l'acteur.
      var pinHash = acteur.pinHash;
      if(!pinHash){
        var bndl = getOfflineBundle();
        var trouve = bndl && bndl.acteurs.find(function(x){ return x.id===acteur.id; });
        if(trouve) pinHash = trouve.pinHash;
      }
      if(pinHash && window.dcodeIO && window.dcodeIO.bcrypt){
        var pinOk = window.dcodeIO.bcrypt.compareSync(pin, pinHash);
        if(!pinOk){ statusEl.className='status err'; statusEl.textContent='Code PIN incorrect.'; return; }
        var site = (state.sitesIndex && state.sitesIndex[acteur.siteId]) ||
          (bndl && bndl.sites.find(function(s){ return s.id===acteur.siteId; }));
        var erreurPos = verifierPresenceLocale(site, geo.lat, geo.lng);
        if(erreurPos){ statusEl.className='status err'; statusEl.textContent=erreurPos; return; }
      } else {
        statusEl.className='status warn';
        statusEl.textContent="Aucune donnée hors-ligne sur cet appareil : votre PIN ne peut pas être vérifié tout de suite, le pointage sera mis en attente.";
      }
      var q = getQueue(); q.push(Object.assign({type:type}, payload)); setQueue(q);
      closePinModal();
      setPointageStatus('Pointage enregistré hors-ligne — sera synchronisé au retour du réseau.', 'warn');
      renderMesPointages();
      return;
    }
    try{
      await apiSend('/api/pointages/'+type, 'POST', payload);
      closePinModal();
      setPointageStatus((type==='arrivee'?'Arrivée':'Départ')+' enregistré(e) pour '+acteur.nom+' à '+payload.heure+'.', 'ok');
      renderMesPointages();
    }catch(e){
      var msg = (e && e.error) || '';
      if(/PIN|loin|géolocalisation/i.test(msg)){
        statusEl.className='status err'; statusEl.textContent = msg;
        return;
      }
      var q2 = getQueue(); q2.push(Object.assign({type:type}, payload)); setQueue(q2);
      closePinModal();
      setPointageStatus('Connexion instable — pointage mis en attente de synchronisation.', 'warn');
    }
  });

  function setPointageStatus(msg, cls){
    var el = document.getElementById('pointageStatus');
    el.className = 'status '+cls; el.textContent = msg;
  }
  function currentActeur(){
    var id = document.getElementById('p-acteur').value;
    return state.acteurs.find(function(a){return a.id===id;});
  }
  document.getElementById('btnArrivee').addEventListener('click', function(){
    var a = currentActeur();
    if(!a){ setPointageStatus('Sélectionnez votre nom avant de pointer.', 'err'); return; }
    openPinModal(a, 'arrivee');
  });
  document.getElementById('btnDepart').addEventListener('click', function(){
    var a = currentActeur();
    if(!a){ setPointageStatus('Sélectionnez votre nom avant de pointer.', 'err'); return; }
    openPinModal(a, 'depart');
  });
  document.getElementById('p-acteur').addEventListener('change', renderMesPointages);

  async function renderMesPointages(){
    var a = currentActeur();
    var el = document.getElementById('mesPointages');
    if(!a){ el.textContent = 'Sélectionnez votre nom pour voir votre historique.'; return; }
    try{
      var list = await apiGet('/api/pointages/mes-pointages?acteurId='+a.id);
      if(!list.length){ el.textContent = 'Aucun pointage enregistré pour le moment.'; return; }
      el.innerHTML = '<table><thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th></tr></thead><tbody>' +
        list.map(function(p){
          return '<tr><td>'+p.date.slice(0,10)+'</td><td>'+(p.heureArrivee||'—')+'</td><td>'+(p.heureDepart||'—')+'</td></tr>';
        }).join('') + '</tbody></table>';
    }catch(e){
      var enAttente = getQueue().filter(function(it){ return it.acteurId===a.id; });
      if(!enAttente.length){ el.textContent = "Historique indisponible hors-ligne pour l'instant."; return; }
      el.innerHTML = '<p class="muted">Hors-ligne — pointages en attente de synchronisation :</p><table><thead><tr><th>Date</th><th>Type</th><th>Heure</th></tr></thead><tbody>' +
        enAttente.map(function(it){
          return '<tr><td>'+it.date+'</td><td>'+(it.type==='arrivee'?'Arrivée':'Départ')+'</td><td>'+it.heure+'</td></tr>';
        }).join('') + '</tbody></table>';
    }
  }

  // ---------- Admin login ----------
  document.getElementById('btnLogin').addEventListener('click', async function(){
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var statusEl = document.getElementById('loginStatus');
    if(!email || !password){ statusEl.className='status err'; statusEl.textContent='Email et mot de passe requis.'; return; }
    try{
      var data = await apiSend('/api/auth/admin/login', 'POST', { email: email, password: password });
      state.token = data.token; state.admin = data.admin;
      localStorage.setItem('epi_token', data.token);
      localStorage.setItem('epi_admin', JSON.stringify(data.admin));
      applyAdminSession();
    }catch(e){
      statusEl.className='status err'; statusEl.textContent = (e && e.error) || 'Connexion impossible.';
    }
  });
  document.getElementById('btnLogout').addEventListener('click', function(){
    state.token = null; state.admin = null;
    localStorage.removeItem('epi_token'); localStorage.removeItem('epi_admin');
    applyAdminSession();
  });
  function applyAdminSession(){
    var logged = !!state.token;
    document.getElementById('loginCard').classList.toggle('hidden', logged);
    document.getElementById('adminContent').classList.toggle('hidden', !logged);
    document.getElementById('dashboardLoginPrompt').classList.toggle('hidden', logged);
    document.getElementById('dashboardContent').classList.toggle('hidden', !logged);
    if(logged){
      document.getElementById('sessionInfo').textContent = state.admin.nom+' — portée : '+(state.admin.portee==='NATIONALE'?'nationale':'secteur');
      document.getElementById('adminsCard').classList.toggle('hidden', state.admin.portee!=='NATIONALE');
      loadDashboard(); loadAbsences(); loadQrCodes();
      if(state.admin.portee==='NATIONALE'){ fillSelect('sv-secteur', state.secteurs, 'Choisir'); loadAdmins(); }
    }
  }

  // ---------- Comptes superviseurs (portée nationale) ----------
  document.getElementById('sv-portee').addEventListener('change', function(){
    document.getElementById('sv-secteur-wrap').classList.toggle('hidden', this.value!=='SECTEUR');
  });
  document.getElementById('btnAddSuperviseur').addEventListener('click', async function(){
    var nom = document.getElementById('sv-nom').value.trim();
    var email = document.getElementById('sv-email').value.trim();
    var password = document.getElementById('sv-password').value;
    var portee = document.getElementById('sv-portee').value;
    var secteurId = document.getElementById('sv-secteur').value;
    var statusEl = document.getElementById('addSuperviseurStatus');
    if(!nom || !email || !password){ statusEl.className='status err'; statusEl.textContent='Nom, email et mot de passe sont requis.'; return; }
    if(portee==='SECTEUR' && !secteurId){ statusEl.className='status err'; statusEl.textContent='Choisissez un secteur pour une portée « secteur ».'; return; }
    try{
      await apiSend('/api/admins', 'POST', { nom: nom, email: email, password: password, portee: portee, secteurId: secteurId||null });
      statusEl.className='status ok'; statusEl.textContent='Compte superviseur créé.';
      document.getElementById('sv-nom').value=''; document.getElementById('sv-email').value=''; document.getElementById('sv-password').value='';
      loadAdmins();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||'Échec de la création.'; }
  });
  async function loadAdmins(){
    try{
      var admins = await apiGet('/api/admins');
      var body = document.getElementById('adminsBody');
      body.innerHTML = admins.length ? admins.map(function(a){
        var canDelete = a.id !== state.admin.id;
        return '<tr><td>'+a.nom+'</td><td>'+a.email+'</td><td>'+(a.portee==='NATIONALE'?'Nationale':'Secteur')+'</td><td>'+(a.secteur?a.secteur.nom:'—')+'</td>'+
          '<td>'+(canDelete?'<button class="secondary small" data-del-admin="'+a.id+'">Révoquer</button>':'')+'</td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">Aucun compte.</td></tr>';
      body.querySelectorAll('[data-del-admin]').forEach(function(btn){
        btn.addEventListener('click', async function(){
          if(!confirm('Révoquer ce compte superviseur ?')) return;
          try{ await apiSend('/api/admins/'+btn.dataset.delAdmin, 'DELETE'); loadAdmins(); }catch(e){}
        });
      });
    }catch(e){}
  }

  // ---------- Dashboard ----------
  document.getElementById('d-secteur').addEventListener('change', async function(){
    await loadSites(this.value, 'd-site', 'Tous');
    loadDashboard();
  });
  document.getElementById('d-site').addEventListener('change', loadDashboard);
  document.getElementById('d-from').addEventListener('change', loadDashboard);
  document.getElementById('d-to').addEventListener('change', loadDashboard);

  async function loadDashboard(){
    if(!state.token) return;
    var secteurId = document.getElementById('d-secteur').value;
    var siteId = document.getElementById('d-site').value;
    var from = document.getElementById('d-from').value;
    var to = document.getElementById('d-to').value;
    var qs = [];
    if(secteurId) qs.push('secteurId='+secteurId);
    if(siteId) qs.push('siteId='+siteId);
    if(from) qs.push('from='+from);
    if(to) qs.push('to='+to);
    var query = qs.length ? ('?'+qs.join('&')) : '';

    try{
      var pointages = await apiGet('/api/pointages'+query);
      var taux = await apiGet('/api/reports/taux-presence'+(secteurId?('?secteurId='+secteurId):''));
      var alertes = await apiGet('/api/reports/alertes'+(secteurId?('?secteurId='+secteurId):''));

      document.getElementById('statCards').innerHTML = [
        statCard(taux.presents+'/'+taux.totalActeurs, "Présents aujourd'hui"),
        statCard(taux.taux+'%', 'Taux de présence du jour'),
        statCard(String(pointages.length), 'Pointages (période filtrée)'),
        statCard(String(alertes.length), 'Alertes actives')
      ].join('');

      var body = document.getElementById('pointagesBody');
      body.innerHTML = pointages.length ? pointages.slice(0,200).map(function(p){
        return '<tr><td>'+p.date.slice(0,10)+'</td><td>'+p.acteur.nom+'</td><td>'+roleLabel(p.acteur.role)+'</td><td>'+p.site.nom+'</td><td>'+(p.heureArrivee||'—')+'</td><td>'+(p.heureDepart||'—')+'</td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">Aucun pointage pour ces filtres.</td></tr>';

      var alertEl = document.getElementById('alertList');
      alertEl.innerHTML = alertes.length ? alertes.slice(0,30).map(function(al){
        var cls = al.joursActifs===0 ? 'err' : 'warn';
        return '<div style="margin-bottom:6px;"><span class="badge '+cls+'">'+(al.joursActifs===0?'Absent':'Retard')+'</span> '+al.nom+' ('+roleLabel(al.role)+', '+al.site+')</div>';
      }).join('') : '<span class="badge ok">Aucune alerte</span>';
    }catch(e){ /* session probablement expirée */ }
  }
  function statCard(n,l){ return '<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }

  document.getElementById('btnExportCsv').addEventListener('click', function(){
    var secteurId = document.getElementById('d-secteur').value;
    var siteId = document.getElementById('d-site').value;
    var from = document.getElementById('d-from').value;
    var to = document.getElementById('d-to').value;
    var qs = [];
    if(secteurId) qs.push('secteurId='+secteurId);
    if(siteId) qs.push('siteId='+siteId);
    if(from) qs.push('from='+from);
    if(to) qs.push('to='+to);
    var url = '/api/reports/csv'+(qs.length?('?'+qs.join('&')):'');
    fetch(url, { headers: authHeaders() }).then(function(res){ return res.blob(); }).then(function(blob){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'pointages_epi.csv'; a.click();
    });
  });

  // ---------- Absences ----------
  document.getElementById('btnAbsence').addEventListener('click', async function(){
    var acteurId = document.getElementById('a-acteur').value;
    var debut = document.getElementById('a-debut').value;
    var fin = document.getElementById('a-fin').value;
    var dispositions = document.getElementById('a-motif').value.trim();
    var statusEl = document.getElementById('absenceStatus');
    if(!acteurId || !debut || !dispositions){ statusEl.className='status err'; statusEl.textContent='Sélectionnez un acteur, une date et les dispositions prises.'; return; }
    try{
      await apiSend('/api/absences', 'POST', { acteurId: acteurId, dateDebut: debut, dateFin: fin||debut, dispositions: dispositions });
      statusEl.className='status ok'; statusEl.textContent='Information envoyée.';
      document.getElementById('a-motif').value='';
      if(state.token) loadAbsences();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||"Échec de l'envoi."; }
  });
  async function loadAbsences(){
    if(!state.token) return;
    try{
      var absences = await apiGet('/api/absences');
      var body = document.getElementById('absencesBody');
      body.innerHTML = absences.length ? absences.map(function(a){
        return '<tr><td>'+a.acteur.nom+'</td><td>'+a.dateDebut.slice(0,10)+' → '+a.dateFin.slice(0,10)+'</td><td>'+a.dispositions+'</td></tr>';
      }).join('') : '<tr><td colspan="3" class="muted">Aucune absence déclarée.</td></tr>';
    }catch(e){}
  }

  // ---------- Transfert manuel (export/import de fichier, sans réseau) ----------
  var btnExporterQueue = document.getElementById('btnExporterQueue');
  if(btnExporterQueue) btnExporterQueue.addEventListener('click', function(){
    var statusEl = document.getElementById('transfertStatus');
    var q = getQueue();
    if(!q.length){ statusEl.className='status info'; statusEl.textContent='Aucun pointage en attente sur cet appareil.'; return; }
    var blob = new Blob([JSON.stringify(q, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pointages_epi_'+todayStr()+'_'+Date.now()+'.json';
    a.click();
    statusEl.className='status ok'; statusEl.textContent = q.length+' pointage(s) exporté(s). Transportez le fichier téléchargé vers un appareil connecté pour l\'importer.';
  });
  var inputImporterQueue = document.getElementById('inputImporterQueue');
  if(inputImporterQueue) inputImporterQueue.addEventListener('change', function(){
    var file = this.files && this.files[0];
    var statusEl = document.getElementById('transfertStatus');
    if(!file) return;
    if(!navigator.onLine){ statusEl.className='status err'; statusEl.textContent='Une connexion réseau est nécessaire sur cet appareil pour importer.'; return; }
    var reader = new FileReader();
    reader.onload = async function(){
      var items;
      try{ items = JSON.parse(reader.result); }catch(e){ statusEl.className='status err'; statusEl.textContent='Fichier invalide.'; return; }
      if(!Array.isArray(items)){ statusEl.className='status err'; statusEl.textContent='Fichier invalide.'; return; }
      statusEl.className='status info'; statusEl.textContent='Import en cours… 0/'+items.length;
      var ok = 0, echecs = 0;
      for(var i=0;i<items.length;i++){
        var it = items[i];
        try{
          await apiSend('/api/pointages/'+it.type, 'POST', {
            acteurId: it.acteurId, pin: it.pin, date: it.date, heure: it.heure,
            lat: it.lat, lng: it.lng, creeHorsLigne: true
          });
          ok++;
        }catch(e){ echecs++; }
        statusEl.textContent = 'Import en cours… '+(ok+echecs)+'/'+items.length;
      }
      statusEl.className = echecs ? 'status warn' : 'status ok';
      statusEl.textContent = ok+' pointage(s) importé(s) avec succès' + (echecs ? ', '+echecs+' en échec (PIN incorrect, hors zone, ou déjà présents).' : '.');
      inputImporterQueue.value = '';
      if(state.token){ loadDashboard(); }
    };
    reader.readAsText(file);
  });

  // ---------- Admin: secteurs / sites / acteurs ----------
  document.getElementById('btnAddSecteur').addEventListener('click', async function(){
    var nom = document.getElementById('n-secteur-nom').value.trim();
    var statusEl = document.getElementById('addSecteurStatus');
    if(!nom){ statusEl.className='status err'; statusEl.textContent='Nom requis.'; return; }
    try{
      await apiSend('/api/secteurs', 'POST', { nom: nom });
      statusEl.className='status ok'; statusEl.textContent='Secteur ajouté.';
      document.getElementById('n-secteur-nom').value='';
      await loadSecteurs();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||'Échec.'; }
  });
  document.getElementById('n-site-secteur').addEventListener('change', function(){}); // placeholder for symmetry
  document.getElementById('btnAddSite').addEventListener('click', async function(){
    var secteurId = document.getElementById('n-site-secteur').value;
    var nom = document.getElementById('n-site-nom').value.trim();
    var statusEl = document.getElementById('addSiteStatus');
    if(!secteurId || !nom){ statusEl.className='status err'; statusEl.textContent='Secteur et nom requis.'; return; }
    try{
      await apiSend('/api/sites', 'POST', { nom: nom, secteurId: secteurId });
      statusEl.className='status ok'; statusEl.textContent='Site ajouté.';
      document.getElementById('n-site-nom').value='';
      loadQrCodes();
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||'Échec.'; }
  });
  document.getElementById('n-secteur').addEventListener('change', async function(){
    await loadSites(this.value, 'n-site', 'Choisir');
  });
  document.getElementById('btnAddActeur').addEventListener('click', async function(){
    var nom = document.getElementById('n-nom').value.trim();
    var role = document.getElementById('n-role').value;
    var secteurId = document.getElementById('n-secteur').value;
    var siteId = document.getElementById('n-site').value;
    var pin = document.getElementById('n-pin').value.trim();
    var statusEl = document.getElementById('addActeurStatus');
    if(!nom || !secteurId || !siteId || !/^\d{4}$/.test(pin)){
      statusEl.className='status err'; statusEl.textContent='Nom, secteur, site et un PIN à 4 chiffres sont requis.'; return;
    }
    try{
      await apiSend('/api/acteurs', 'POST', { nom: nom, role: role, secteurId: secteurId, siteId: siteId, pin: pin });
      statusEl.className='status ok'; statusEl.textContent='Acteur ajouté.';
      document.getElementById('n-nom').value=''; document.getElementById('n-pin').value='';
    }catch(e){ statusEl.className='status err'; statusEl.textContent=(e&&e.error)||"Échec de l'ajout."; }
  });

  async function loadQrCodes(){
    if(!state.token) return;
    try{
      var sites = await apiGet('/api/qrcodes');
      var grid = document.getElementById('qrGrid');
      grid.innerHTML = sites.length ? sites.map(function(s){
        var positionne = s.latitude!=null && s.longitude!=null;
        var statutPosition = positionne
          ? '<span class="badge ok">Position définie</span>'
          : '<span class="badge warn">Position non définie</span>';
        return '<div class="qritem"><img src="'+s.qrUrl+'" alt="QR '+s.nom+'"><div class="name">'+s.nom+'</div><div class="muted">'+s.secteur+'</div>'+
          '<div style="margin:6px 0;">'+statutPosition+'</div>'+
          '<button class="secondary small" data-set-pos="'+s.id+'">Définir la position (être sur place)</button></div>';
      }).join('') : '<div class="muted">Aucun site pour le moment.</div>';
      grid.querySelectorAll('[data-set-pos]').forEach(function(btn){
        btn.addEventListener('click', async function(){
          btn.disabled = true; btn.textContent = 'Localisation…';
          try{
            var geo = await getGeoloc();
            await apiSend('/api/sites/'+btn.dataset.setPos+'/position', 'PATCH', { latitude: geo.lat, longitude: geo.lng });
            loadQrCodes();
          }catch(e){
            alert((e && e.message) || (e && e.error) || "Impossible d'obtenir la position.");
            btn.disabled = false; btn.textContent = 'Définir la position (être sur place)';
          }
        });
      });
    }catch(e){}
  }

  // ---------- URL site preselection ----------
  function applyUrlSite(){
    if(!urlSite) return;
    var ctx = document.getElementById('siteContext');
    ctx.classList.remove('hidden');
    ctx.textContent = urlLat && urlLng
      ? 'Site sélectionné via QR code. Vous devez être physiquement sur place pour pouvoir pointer.'
      : 'Site sélectionné via QR code. Choisissez votre nom pour pointer.';
  }

  // ---------- Init ----------
  async function init(){
    applyUrlSite();
    renderQueue();
    renderOfflineStatus();
    await loadSecteurs();
    if(urlSite){
      var sites;
      try{ sites = await apiGet('/api/sites'); }
      catch(e){ var b0 = getOfflineBundle(); sites = b0 ? b0.sites : []; }
      var site = sites.find(function(s){return s.id===urlSite;});
      if(site){
        document.getElementById('p-secteur').value = site.secteurId;
        await loadSites(site.secteurId, 'p-site', 'Tous les sites');
        document.getElementById('p-site').value = urlSite;
        await loadActeurs(site.secteurId, urlSite);
      }
    } else {
      await loadActeurs();
    }
    applyAdminSession();
    trySyncQueue();
    if(navigator.onLine) telechargerPourHorsLigne().catch(function(){});
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    }
  }
  init();
})();
