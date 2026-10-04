// Spotify bağlantısı olmadan denemek için sentetik ama gerçekçi bir kütüphane.
// Şarkı: "Ad|Sanatçı|yıl|popülerlik|listeler" (G=Gece Sürüşü, P=Pazar Sabahı, T=Türkçe Hüzün, S=Spor)
import { rng } from "./mine.mjs";

const PLAYLISTS = [
  { id: "G", name: "Gece Sürüşü" },
  { id: "P", name: "Pazar Sabahı" },
  { id: "T", name: "Türkçe Hüzün" },
  { id: "S", name: "Spor" },
];

const GENRES = {
  Kavinsky: "synthwave,retrowave", "College & Electric Youth": "synthwave,electropop", "Carpenter Brut": "darksynth,synthwave",
  "The Midnight": "synthwave,retrowave", HOME: "synthwave,vaporwave", Gunship: "synthwave,darksynth", MGMT: "indie,psychedelic pop",
  Grimes: "art pop,electropop", "Beach House": "dream pop,indie", "Mazzy Star": "dream pop,slowcore", "Cocteau Twins": "dream pop,shoegaze",
  "The Cure": "post-punk,new wave,gothic rock", "Joy Division": "post-punk,gothic rock", Pixies: "alternative rock,indie", Bauhaus: "gothic rock,post-punk",
  "Aphex Twin": "idm,ambient techno,electronic", "Boards of Canada": "idm,ambient,electronic", Moby: "electronica,downtempo",
  "Massive Attack": "trip hop,downtempo", Portishead: "trip hop,downtempo",
  "Bon Iver": "indie folk,chamber folk", "Fleet Foxes": "indie folk,baroque pop", "José González": "indie folk,acoustic", "Lord Huron": "indie folk,folk rock",
  "The Postal Service": "indietronica,electropop", "Miles Davis": "cool jazz,jazz", "Dave Brubeck": "cool jazz,jazz",
  "Erik Satie": "classical,impressionism", "Ludovico Einaudi": "neoclassical,piano", "The Velvet Underground": "art rock,proto-punk",
  "Neil Young": "folk rock,singer-songwriter", "Simon & Garfunkel": "folk rock,soft rock", "Jeff Buckley": "singer-songwriter,alternative rock",
  "Mor ve Ötesi": "turkish rock,alternative rock", "Barış Manço": "anatolian rock,turkish pop", "Sezen Aksu": "turkish pop,arabesk",
  Teoman: "turkish rock,alternative rock", "Şebnem Ferah": "turkish rock,rock", Pinhani: "turkish pop,alternative rock", Duman: "turkish rock,alternative rock",
  "Cem Karaca": "anatolian rock,turkish rock", "Erkin Koray": "anatolian rock,psychedelic rock", "Selda Bağcan": "anatolian rock,turkish folk",
  Eminem: "hip hop,rap", "Kanye West": "hip hop,rap", Macklemore: "hip hop,pop rap", Ramones: "punk rock,punk", "The White Stripes": "garage rock,blues rock",
  "Daft Punk": "french house,electronic", Underworld: "big beat,electronic", "Eric Prydz": "progressive house,electronic", Deadmau5: "progressive house,electro house",
  "Fort Minor": "hip hop,rap rock", "Kendrick Lamar": "hip hop,west coast rap",
};

const RAW = `
Nightcall|Kavinsky|2010|68|GS
A Real Hero|College & Electric Youth|2010|66|G
Turbo Killer|Carpenter Brut|2015|52|GS
Sunset|The Midnight|2016|58|G
Resonance|HOME|2014|70|G
Tech Noir|Gunship|2015|55|G
Kids|MGMT|2007|78|GS
Genesis|Grimes|2012|65|G
Space Song|Beach House|2015|85|GP
Fade Into You|Mazzy Star|1993|80|GP
Cherry-coloured Funk|Cocteau Twins|1990|55|G
Just Like Heaven|The Cure|1987|82|GT
A Forest|The Cure|1980|62|G
Love Will Tear Us Apart|Joy Division|1980|78|G
Disorder|Joy Division|1979|58|G
Where Is My Mind?|Pixies|1988|80|G
Bela Lugosi's Dead|Bauhaus|1979|55|G
Windowlicker|Aphex Twin|1999|55|GS
Avril 14th|Aphex Twin|2001|70|GP
Xtal|Aphex Twin|1992|55|G
Roygbiv|Boards of Canada|1998|60|G
Dayvan Cowboy|Boards of Canada|2005|58|G
Porcelain|Moby|1999|68|G
Teardrop|Massive Attack|1998|78|GP
Angel|Massive Attack|1998|70|G
Glory Box|Portishead|1994|72|G
Roads|Portishead|1994|68|G
Holocene|Bon Iver|2011|75|P
Skinny Love|Bon Iver|2007|78|P
Re: Stacks|Bon Iver|2008|65|P
Mykonos|Fleet Foxes|2008|65|P
White Winter Hymnal|Fleet Foxes|2008|72|P
Heartbeats|José González|2003|70|P
The Night We Met|Lord Huron|2015|82|P
Such Great Heights|The Postal Service|2003|76|P
Blue in Green|Miles Davis|1959|68|PG
So What|Miles Davis|1959|70|P
Take Five|Dave Brubeck|1959|72|P
Gymnopédie No.1|Erik Satie|1888|75|P
Nuvole Bianche|Ludovico Einaudi|2004|74|P
Experience|Ludovico Einaudi|2013|75|P
Sunday Morning|The Velvet Underground|1967|65|P
Harvest Moon|Neil Young|1992|72|P
The Boxer|Simon & Garfunkel|1969|70|P
Hallelujah|Jeff Buckley|1994|78|PT
Bir Derdim Var|Mor ve Ötesi|2004|60|T
Cambaz|Mor ve Ötesi|2004|58|T
Gülpembe|Barış Manço|1981|70|T
Dönence|Barış Manço|1982|68|T
Sen Ağlama|Sezen Aksu|1991|72|T
Firuze|Sezen Aksu|1988|68|T
Paramparça|Teoman|2000|66|T
İstanbul'da Sonbahar|Teoman|1996|58|T
Sil Baştan|Şebnem Ferah|1996|68|T
Beni Al|Pinhani|2009|65|T
Her Şeyi Yak|Duman|2004|72|T
Köprüaltı|Duman|2002|60|T
Resimdeki Gözyaşları|Cem Karaca|1975|60|T
Tamirci Çırağı|Cem Karaca|1974|62|T
Şaşkın|Erkin Koray|1974|60|TG
İnce İnce Bir Kar Yağar|Selda Bağcan|1976|52|TG
Lose Yourself|Eminem|2002|85|S
Till I Collapse|Eminem|2002|80|S
Power|Kanye West|2010|75|S
Stronger|Kanye West|2007|82|S
Can't Hold Us|Macklemore|2011|78|S
Blitzkrieg Bop|Ramones|1976|70|S
Seven Nation Army|The White Stripes|2003|85|S
Harder Better Faster Stronger|Daft Punk|2001|80|S
One More Time|Daft Punk|2000|82|S
Around the World|Daft Punk|1997|70|S
Born Slippy|Underworld|1996|70|S
Opus|Eric Prydz|2015|60|S
Strobe|Deadmau5|2009|68|S
Remember the Name|Fort Minor|2005|72|S
HUMBLE.|Kendrick Lamar|2017|88|S
DNA.|Kendrick Lamar|2017|82|S
Alright|Kendrick Lamar|2015|78|S
`;

// Her listenin "zaman penceresi" ve belirli sanatçılar için tek geceye sıkışmış patlama günleri.
const WINDOW = { G: ["2021-03-01", "2022-08-30"], P: ["2019-04-01", "2020-12-20"], T: ["2023-02-01", "2023-11-30"], S: ["2018-01-10", "2024-05-30"] };
const BURSTS = {
  "Aphex Twin": "2022-03-06T01:42:00Z", "Boards of Canada": "2022-03-06T02:10:00Z", Portishead: "2022-03-06T02:31:00Z", "Massive Attack": "2022-03-06T02:47:00Z",
  Kavinsky: "2021-11-14T23:51:00Z", "Carpenter Brut": "2021-11-14T23:58:00Z", Gunship: "2021-11-15T00:09:00Z", "The Midnight": "2021-11-15T00:20:00Z", HOME: "2021-11-15T00:31:00Z",
  "Kendrick Lamar": "2024-02-03T07:12:00Z", Eminem: "2018-01-10T06:30:00Z", "Daft Punk": "2018-01-10T06:41:00Z",
};

export function demoLibrary() {
  const r = rng(2024);
  const artists = {};
  const tracks = RAW.trim().split("\n").map((line, i) => {
    const [name, artist, year, pop, pls] = line.split("|");
    const [from, to] = WINDOW[pls[0]].map(Date.parse);
    const iso = BURSTS[artist] ? new Date(Date.parse(BURSTS[artist]) + Math.floor(r() * 600000)).toISOString() : new Date(from + r() * (to - from) + 19 * 3600000 * r()).toISOString();
    const aid = "a_" + artist.toLowerCase().replace(/[^a-z0-9]/g, "");
    artists[aid] = { name: artist, genres: (GENRES[artist] || "").split(",").filter(Boolean), popularity: 50 };
    return {
      id: "demo" + i, uri: "spotify:track:demo" + i, name, artists: [{ id: aid, name: artist }], album: "", year: Number(year),
      popularity: Number(pop), durationMs: 150000 + Math.floor(r() * 200000), explicit: false, addedAt: iso, playlists: pls.split(""),
    };
  });
  const counts = Object.fromEntries(PLAYLISTS.map((p) => [p.id, tracks.filter((t) => t.playlists.includes(p.id)).length]));
  return { playlists: PLAYLISTS.map((p) => ({ ...p, count: counts[p.id] })), tracks, artists };
}

export const demoPlaylists = () => demoLibrary().playlists;
