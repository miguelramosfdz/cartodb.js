
/*
 *  common functions for cartodb connector
 */

function CartoDBLayerCommon() {}

CartoDBLayerCommon.prototype = {

  // the way to show/hidelayer is to set opacity
  // removing the interactivty at the same time
  show: function() {
    if (this.options.visible) {
      return;
    }
    this.options.visible = true;
    this.setOpacity(this.options.previous_opacity);
    delete this.options.previous_opacity;
    this.setInteraction(true);
  },

  hide: function() {
    if (!this.options.visible) {
      return;
    }
    this.options.previous_opacity = this.options.opacity;
    this.setOpacity(0);
    this.setInteraction(false);

    this.options.visible = false;
  },


  /**
   * Check if CartoDB logo already exists
   */
  _isWadusAdded: function(container, className) {
    // Check if any cartodb-logo exists within container
    var a = [];
    var re = new RegExp('\\b' + className + '\\b');
    var els = container.getElementsByTagName("*");
    for(var i=0,j=els.length; i<j; i++)
      if(re.test(els[i].className))a.push(els[i]);

    return a.length > 0;
  },


  /**
   * Add Cartodb logo
   * It needs a position, timeout if it is needed and the container where add it
   */
  _addWadus: function(position, timeout, container) {
    if (this.options.cartodb_logo !== false && !this._isWadusAdded(container, 'cartodb_logo')) {
      var cartodb_link = document.createElement("a");
      cartodb_link.setAttribute('class','cartodb_logo');
      container.appendChild(cartodb_link);
      setTimeout(function() {
        cartodb_link.setAttribute('style',"position:absolute; bottom:0; left:0; display:block; border:none; z-index:10000;");
        cartodb_link.setAttribute('href','http://www.cartodb.com');
        cartodb_link.setAttribute('target','_blank');
        var protocol = location.protocol.indexOf('https') === -1 ? 'http': 'https';
        cartodb_link.innerHTML = "<img src='" + protocol + "://cartodb.s3.amazonaws.com/static/new_logo.png' style='position:absolute; bottom:" + 
          ( position.bottom || 0 ) + "px; left:" + ( position.left || 0 ) + "px; display:block; border:none; outline:none' alt='CartoDB' title='CartoDB' />";
      },( timeout || 0 ));
    }
  },

  _tilerHost: function() {
    var opts = this.options;
    return opts.tiler_protocol +
         "://" + ((opts.user_name) ? opts.user_name+".":"")  +
         opts.tiler_domain +
         ((opts.tiler_port != "") ? (":" + opts.tiler_port) : "");
  },

  _host: function(subhost) {
    var opts = this.options;
    if (opts.no_cdn) {
      return this._tilerHost();
    } else {
      var h = opts.tiler_protocol + "://";
      if (subhost) {
        h += subhost + ".";
      }
      h += cdb.CDB_HOST[opts.tiler_protocol] + "/" + opts.user_name;
      return h;
    }
  },

  //
  // param ext tile extension, i.e png, json
  // 
  _tilesUrl: function(ext, subdomain) {
    var opts = this.options;
    ext = ext || 'png';
    var cartodb_url = this._host(subdomain) + '/tiles/' + opts.table_name + '/{z}/{x}/{y}.' + ext + '?';

    // set params
    var params = {};
    if(opts.query) {
      params.sql = opts.query;
    }

    if(opts.query_wrapper) {
      params.sql = _.template(opts.query_wrapper)({ sql: params.sql || "select * from " + opts.table_name });
    }

    if(opts.tile_style && !opts.use_server_style) {
      params.style = opts.tile_style;
    }
    // style_version is only valid when tile_style is present
    if(opts.tile_style && opts.style_version && !opts.use_server_style) {
      params.style_version = opts.style_version;
    }

    if(ext === 'grid.json') {
      if(opts.interactivity) {
        params.interactivity = opts.interactivity.replace(/ /g, '');
      }
    }

    // extra_params?
    for (_param in opts.extra_params) {
       params[_param] = opts.extra_params[_param];
    }

    var url_params = [];
    for(var k in params) {
      var p = params[k];
      if(p) {
        var q = encodeURIComponent(
          p.replace ? 
            p.replace(/\{\{table_name\}\}/g, opts.table_name):
            p
        );
        q = q.replace(/%7Bx%7D/g,"{x}").replace(/%7By%7D/g,"{y}").replace(/%7Bz%7D/g,"{z}");
        url_params.push(k + "=" + q);
      }
    }
    cartodb_url += url_params.join('&');

    return cartodb_url;
  },

  isHttps: function() {
    return this.options.tiler_protocol === 'https';
  },

  _layerGroupTiles: function(layerGroupId, extraParams) {
    var subdomains = this.options.subdomains || ['0', '1', '2', '3'];
    if(this.isHttps()) {
      subdomains = [null]; // no subdomain
    } 

    var tileTemplate = '/{z}/{x}/{y}';

    var grids = []
    var tiles = [];
    for(var i = 0; i < subdomains.length; ++i) {
      var s = subdomains[i]
      var cartodb_url = this._host(s) + '/tiles/layergroup/' + layerGroupId 
      tiles.push(cartodb_url + tileTemplate + ".png");
      for(var layer in this.options.layer_definition.layers) {
        grids[layer] = grids[layer] || [];
        grids[layer].push(cartodb_url + "/" + layer + "/" + tileTemplate + ".grid.json");
      }
    }
    
    return {
      tiles: tiles,
      grids: grids
    }

  },

  getLayerCount: function() {
    return this.options.layer_definition.layers.length;
  },

  removeLayer: function(layer) {
    if(layer < this.getLayerCount() && layer >= 0) {
      this.options.layer_definition.layers.splice(layer, 1);
    }
    return this;
  },

  getLayer: function(index) {
    return this.options.layer_definition.layers[index]
  },

  addLayer: function(def, layer) {
    layer = layer === undefined ? this.getLayerCount(): layer;
    if(layer <= this.getLayerCount() && layer >= 0) {
      if(!def.sql || !def.cartocss) {
        throw new Error("layer definition should contain at least a sql and a cartocss");
        return this;
      }
      this.options.layer_definition.layers.splice(layer, 0, {
        type: 'cartodb',
        options: def
      });
    }
    return this;
  },

  _tileJSON: function () {
    var grids = [];
    var tiles = [];
    var subdomains = this.options.subdomains || ['0', '1', '2', '3'];
    if(this.isHttps()) {
      subdomains = [null]; // no subdomain
    } 

    // use subdomains
    for(var i = 0; i < subdomains.length; ++i) {
      var s = subdomains[i]
      grids.push(this._tilesUrl('grid.json', s));
      tiles.push(this._tilesUrl('png', s));
    }
    return {
        tilejson: '2.0.0',
        scheme: 'xyz',
        grids: grids,
        tiles: tiles,
        formatter: function(options, data) { return data; }
    };
  },

  //TODO: support old browsers
  layerToken: function(layerGroup, callback) {
    var ajax = this.options.ajax || $.ajax;
    ajax({
      crossOrigin: true,
      type: 'POST',
      dataType: 'json',
      contentType: 'application/json',
      url: this._tilerHost() + '/tiles/layergroup',
      data: JSON.stringify(this.options.layer_definition),
      success: function(data) {
        callback(data);
      },
      error: function() {
        callback(null);
      }
    });
  },

  error: function(e) {
    console.log(e.error);
  },

  tilesOk: function() {
  },

  /**
   *  Check the tiles
   */
  _checkTiles: function() {
    var xyz = {z: 4, x: 6, y: 6}
      , self = this
      , img = new Image()
      , urls = this._tileJSON()

    var grid_url = urls.tiles[0].replace(/\{z\}/g,xyz.z).replace(/\{x\}/g,xyz.x).replace(/\{y\}/g,xyz.y);


    $.ajax({
      method: "get",
      url: grid_url,
      crossDomain: true,
      success: function() {
        self.tilesOk();
        clearTimeout(timeout)
      },
      error: function(xhr, msg, data) {
        clearTimeout(timeout);
        self.error(xhr.responseText && JSON.parse(xhr.responseText));
      }
    });

    // Hacky for reqwest, due to timeout doesn't work very well
    var timeout = setTimeout(function(){
      clearTimeout(timeout);
      self.error("tile timeout");
    }, 30000);

  }

};

