// Google's bootstrap loader for the Maps JavaScript API. It defines
// google.maps.importLibrary(), and fetches the API from maps.googleapis.com the
// first time that is called.
//
// Copied from Google's documentation, whose code samples are Apache 2.0:
// https://developers.google.com/maps/documentation/javascript/load-maps-js-api
//
// Google publishes it as an inline <script>. It is a file here because this
// app's CSP has no 'unsafe-inline' in script-src, so an inline copy would not
// run. The one edit is the argument at the bottom: the key is read from the
// #map element, where the view puts it, not written here as a literal.
//
// Vendor code. Prettier and ESLint skip this file. Don't tidy the long line;
// replace it whole when Google publishes a new one.
;(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
	key: document.getElementById('map').dataset.mapsKey,
	v: 'weekly',
})
