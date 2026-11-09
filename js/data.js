/* =========================================================================
   DATA — static data: planet radius, points of interest (POIs), the
   narrative journey of the guided mission, and scientific data layers.
   ========================================================================= */

const MARS_RADIUS = 50;

/* -------------------- POIs for free exploration -------------------- */
const POIS = [
  { id:'jezero', name:'Jezero Crater', lat:18.4447, lon:77.4508, type:'landing',
    mission:'Perseverance (2021)', elevation:-2600,
    description:'Ancient fossilized river delta. Landing site of the Perseverance rover, rich in clay minerals.',
    hazard:'Uneven rocky terrain and fine sand dunes may compromise mobility.',
    resource:'Strong evidence of subsurface water ice and carbonate minerals.',
    photoQuery:'Jezero crater Mars Perseverance aerial' },
  { id:'gale', name:'Gale Crater', lat:-5.4, lon:137.8, type:'landing',
    mission:'Curiosity (2012)', elevation:-4500,
    description:'Impact crater with the central Mount Sharp, whose layers record billions of years of Martian climate.',
    hazard:'Fine suspended dust and elevated surface radiation.',
    resource:'Hydrated clays and sulfates indicate past liquid water presence.',
    photoQuery:'Gale crater Curiosity rover Mount Sharp' },
  { id:'elysium', name:'Elysium Planitia', lat:4.5, lon:135.9, type:'landing',
    mission:'InSight (2018)', elevation:-2600,
    description:'Vast flat volcanic plain, ideal for seismological studies of the deep Martian interior.',
    hazard:'Seasonal dust storms may cover solar panels.',
    resource:'Stable subsoil, suitable for drilling and equipment installation.',
    photoQuery:'InSight lander Mars Elysium Planitia' },
  { id:'olympus', name:'Olympus Mons', lat:18.65, lon:-133.8, type:'geological',
    mission:'Orbital observation (MRO / MOLA)', elevation:21900,
    description:'The largest volcano in the Solar System: 21.9 km high and ~600 km in base diameter.',
    hazard:'Extremely steep slopes and even thinner atmosphere at altitude.',
    resource:'Possible deep lava tubes, candidates for natural shelters against radiation.',
    photoQuery:'Olympus Mons Mars volcano orbital image' },
  { id:'valles', name:'Valles Marineris', lat:-14, lon:-59.2, type:'geological',
    mission:'Orbital observation (MRO / MOLA)', elevation:-6000,
    description:'Canyon system stretching over 4,000 km with depths of up to 7 km.',
    hazard:'Slope landslides and unstable rocky walls.',
    resource:'Exposed layers reveal geological strata from multiple Martian eras.',
    photoQuery:'Valles Marineris Mars canyon satellite' },
  { id:'southpole', name:'South Polar Cap', lat:-87, lon:0, type:'resource',
    mission:'Mars Express / MRO', elevation:1000,
    description:'Permanent cap composed of water ice and dry ice (CO₂).',
    hazard:'Extreme temperatures (down to -125°C) and a long polar night.',
    resource:'Enormous water ice reserves for fuel production and life support.',
    photoQuery:'Mars south pole ice cap' },
  { id:'medusae', name:'Medusae Fossae', lat:4.5, lon:-163, type:'hazard',
    mission:'Orbital observation (Mars Odyssey)', elevation:-1500,
    description:'Possibly the largest pyroclastic deposit ever identified in the Solar System.',
    hazard:'Extremely fine electrostatic dust reduces visibility and may damage equipment.',
    resource:'Key study site for understanding explosive volcanism on ancient Mars.',
    photoQuery:'Medusae Fossae formation Mars' },
];
const TYPE_COLORS = { landing:'#ff6b35', geological:'#4fd1ff', resource:'#39ff88', hazard:'#ff3b5c' };
const TYPE_LABELS = { landing:'LANDING SITE', geological:'GEOLOGICAL FEATURE', resource:'NATURAL RESOURCE', hazard:'HAZARD ZONE' };
const TYPE_ICONS  = { landing:'🛬', geological:'⛰️', resource:'💧', hazard:'⚠️' };

/* -------------------- Narrative journey (Operation Jezero) -------------------- */
const storyWaypoints = [
  {
    name:'Octavia E. Butler Landing', subtitle:'Official Landing Site of the Ares-7 Mission', icon:'🛬',
    lat:18.4447, lon:77.4508, elevation:-2580,
    objective:'Calibrate EVA suits and collect the regolith sample near the scientific beacon.',
    narrative:'Sol 1350. The landing was perfect — the "Resolve" module touched down on the reddish ground at the exact spot named after writer Octavia E. Butler, the same location where the Perseverance rover landed fourteen years ago. Through the helmet visor, I can still see the marks of its wheels in the fine dust, like a trail left for us.',
    hazard:'Static dust may cling to suits and optical sensors during descent.',
    resource:'Flat and stable location, ideal for base camp installation.',
    sample:'Sample JZ-00: Surface regolith',
    photoQuery:'Perseverance rover landing Jezero crater'
  },
  {
    name:'Séítah Dunes', subtitle:'Rocky Terrain Rich in Olivine', icon:'🏜️',
    lat:18.415, lon:77.47, elevation:-2610,
    objective:'Walk to the beacon and collect an igneous rock core for mineral crystallization analysis.',
    narrative:'After two hours of walking over uneven terrain, we reached Séítah — "amidst the sand," in Navajo. The rocks here are crystallized, full of olivine, formed by lava that once flowed over the bottom of a lake. Touching the rock with my own (gloved) hands is an experience unlike any other.',
    hazard:'Fine, abrasive sand may compromise the suit\'s mechanical joints.',
    resource:'Igneous rocks with olivine crystals suggest volcanic activity preserved for billions of years.',
    sample:'Sample JZ-01: Basalt with olivine',
    photoQuery:'Jezero crater Seitah rocks Perseverance rover'
  },
  {
    name:'Three Forks', subtitle:'Confluence of Three Ancient River Channels', icon:'🌊',
    lat:18.40, lon:77.49, elevation:-2590,
    objective:'Map the direction of the ancient channels using the portable ground radar at the indicated beacon.',
    narrative:'Here, three ancient channels meet — proof that water flowed into Jezero Crater across multiple events over millions of years. The ground radar reveals alternating sediment layers, like geological "tree rings."',
    hazard:'Loose rock blocks in the channel bed may cause slips.',
    resource:'Sediment stratification confirms cycles of flooding and drought.',
    sample:'Sample JZ-02: Stratified sediment',
    photoQuery:'Three Forks Jezero crater delta Perseverance'
  },
  {
    name:'Hawksbill Gap', subtitle:'Access Ramp to the Fossilized Delta', icon:'⛰️',
    lat:18.42, lon:77.51, elevation:-2500,
    objective:'Climb the slope to the beacon and record atmospheric pressure variation with altitude.',
    narrative:'The climb through Hawksbill Gap is the most demanding stretch so far. From the top, I can see the entire extent of the ancient delta opening up like a dark rock fan against the orange horizon. "We are at the threshold of the delta. Ready to continue."',
    hazard:'Steep incline increases fall risk; cardiac strain monitored.',
    resource:'Strategic observation point for photographic mapping of the entire Jezero basin.',
    sample:'Sample JZ-03: Rock core from the slope',
    photoQuery:'Hawksbill Gap Jezero crater Perseverance'
  },
  {
    name:'Fossilized Delta Plateau', subtitle:'Top of the Ancient River Delta', icon:'🏞️',
    lat:18.44, lon:77.53, elevation:-2420,
    objective:'Drill and extract a clay core at the beacon for the orbital laboratory.',
    narrative:'We are literally walking over what was once a great Martian lake bed. The clay layers here preserve the kind of material that may hold organic molecules for eons. We have the chance to drill deeper than any rover has ever managed.',
    hazard:'Ultra-fine suspended dust reduces visibility; a polarized visor is recommended.',
    resource:'Hydrated clay minerals indicate water stability over long periods.',
    sample:'Sample JZ-04: Laminated clay core',
    photoQuery:'Jezero crater delta top Perseverance rover'
  },
  {
    name:'Witch Hazel Hill', subtitle:'Final Horizon — Rim of Jezero Crater', icon:'🏁',
    lat:18.46, lon:77.56, elevation:-2300,
    objective:'Walk to the beacon and deploy the mission\'s permanent scientific marker.',
    narrative:'We made it. From the top of Witch Hazel Hill, the rim of Jezero Crater stretches before us like the shore of an ocean that no longer exists. We completed what Perseverance began: the first complete human traverse of the cradle of an ancient Martian lake.',
    hazard:'Slope winds may intensify at dusk.',
    resource:'Full panoramic view of the crater; ideal location for a permanent communication antenna.',
    sample:'Sample JZ-05: Crater rim rock',
    photoQuery:'Witch Hazel Hill Jezero crater rim Perseverance'
  }
];

/* -------------------- Data layers -------------------- */
const LAYERS = [
  { id:'none', label:'Real Surface', icon:'🪐', legend:null },
  { id:'elevation', label:'Topography (MOLA)', icon:'🗻',
    legend:{gradient:'linear-gradient(90deg,#1b2a8c,#2fa84f,#e8d44d,#e3652a,#c21f1f)', min:'-8 km', max:'+22 km'} },
  { id:'temperature', label:'Temperature', icon:'🌡️',
    legend:{gradient:'linear-gradient(90deg,#1b3a8c,#4fd1ff,#e8d44d,#ff6b35)', min:'-125°C', max:'20°C'} },
  { id:'radiation', label:'Cosmic Radiation', icon:'☢️',
    legend:{gradient:'linear-gradient(90deg,#113a2d,#39ff88,#e8d44d,#ff3b5c)', min:'0.1 mSv/d', max:'0.9 mSv/d'} },
  { id:'water', label:'Water Ice', icon:'💧',
    legend:{gradient:'linear-gradient(90deg,transparent,#1b6fd1,#aee6ff)', min:'low prob.', max:'high prob.'} },
];