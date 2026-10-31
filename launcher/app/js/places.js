/*
 * Cities for the weather widget. Approximate city-centre coordinates only:
 * Premium Home never uses GPS, IP lookup or street-level locations.
 */
(function (PH) {
  'use strict';

  var cities = [
    { id: 'edmonton', name: 'Edmonton', region: 'AB', lat: 53.55, lon: -113.49 },
    { id: 'calgary', name: 'Calgary', region: 'AB', lat: 51.05, lon: -114.07 },
    { id: 'reddeer', name: 'Red Deer', region: 'AB', lat: 52.27, lon: -113.81 },
    { id: 'grandeprairie', name: 'Grande Prairie', region: 'AB', lat: 55.17, lon: -118.79 },
    { id: 'lethbridge', name: 'Lethbridge', region: 'AB', lat: 49.70, lon: -112.84 },
    { id: 'saskatoon', name: 'Saskatoon', region: 'SK', lat: 52.13, lon: -106.67 },
    { id: 'vancouver', name: 'Vancouver', region: 'BC', lat: 49.28, lon: -123.12 },
    { id: 'toronto', name: 'Toronto', region: 'ON', lat: 43.65, lon: -79.38 }
  ];

  PH.cities = cities;
  PH.cityById = Object.create(null);
  cities.forEach(function (c) { PH.cityById[c.id] = c; });
  PH.DEFAULT_CITY = 'toronto';
})(window.PH = window.PH || {});
