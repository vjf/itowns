/**
 * Generated On: 2015-10-5
 * Class: WMS_Provider
 * Description: Provides data from a WMS stream
 */

import * as THREE from 'three';
import Extent from '../../Geographic/Extent';
import OGCWebServiceHelper from './OGCWebServiceHelper';
import Fetcher from './Fetcher';

const mimeTypeByTagName = {
    JPEG: 'image/jpeg',
    PNG: 'image/png',
    GIF: 'image/gif',
    PPM: 'image/x‑portable‑pixmap',
    TIFF: 'image/tiff',
    GeoTIFF: 'image/tiff',
    WebCGM: 'image/cgm;Version=4;ProfileId=WebCGM',
    SVG: 'image/svg+xml',
    WMS_XML: 'application/vnd.ogc.wms_xml',
    'GML.1': 'application/gml+xml',
    'GML.2': 'application/gml+xml',
    'GML.3': 'application/gml+xml',
    WBMP: 'image/vnd.wap.wbmp',
    MIME: 'www/mime', // Not sure of this one (there's also message/rfc822)
};
/* For reference, there are also these 2 possible tags that do not translate to mimetype
   INIMAGE display text in the returned image -->
   BLANK return an image with all pixels transparent if
   */

function getCrsPropName(version) {
    return version === '1.3.0' ? 'CRS' : 'SRS';
}

function getGeoTagName(version) {
    return version === '1.3.0' ? 'EX_GeographicBoundingBox' : 'LatLonBoundingBox';
}

function _parseSupportedCrs(version, xmlLayer) {
    let supportedCrs = [];
    const crsPropName = getCrsPropName(version);

    for (const childElem of xmlLayer.children) {
        if (childElem.tagName === crsPropName) {
            supportedCrs = supportedCrs.concat(childElem.textContent.trim().split(' '));
        }
    }
    if (xmlLayer.parentNode && xmlLayer.parentNode.tagName === 'Layer') {
        supportedCrs = supportedCrs.concat(_parseSupportedCrs(version, xmlLayer.parentNode));
    }

    return supportedCrs;
}

function parseSupportedCrs(version, xmlLayer) {
    return new Set(_parseSupportedCrs(version, xmlLayer));
}

function parseExtent(version, targetCrs, xmlLayer) {
    let extent = parseLayerBoundingBox(version, targetCrs, xmlLayer);
    if (extent) {
        return extent;
    }

    // fallback to CRS:84 boundingbox
    extent = parseLayerBoundingBox(version, 'CRS:84', xmlLayer);
    if (extent) {
        return extent;
    }

    // fallback to any other BoundingBox
    extent = parseLayerBoundingBox(version, null, xmlLayer);
    if (extent) {
        return extent;
    }

    // fallback to imprecise geographic bounds
    return parseGeoBounds(version, xmlLayer);
}

function parseLayerBoundingBox(version, targetCrs, xmlLayer) {
    const crsPropName = getCrsPropName(version);
    for (const childElem of xmlLayer.children) {
        if (childElem.tagName === 'BoundingBox' && (!targetCrs || targetCrs === childElem.getAttribute(crsPropName))) {
            return new Extent(
                    childElem.getAttribute(crsPropName),
                    childElem.getAttribute('minx'),
                    childElem.getAttribute('maxx'),
                    childElem.getAttribute('miny'),
                    childElem.getAttribute('maxy'));
        }
    }
    if (xmlLayer.parentNode && xmlLayer.parentNode.tagName === 'Layer') {
        return parseLayerBoundingBox(version, targetCrs, xmlLayer.parentNode);
    }
}

function parseGeoBounds(version, xmlLayer) {
    const geoTagName = getGeoTagName(version);
    for (const childElem of xmlLayer.children) {
        if (childElem.tagName === geoTagName) {
            return new Extent(
                    'CRS:84',
                    childElem.getAttribute('minx'),
                    childElem.getAttribute('maxx'),
                    childElem.getAttribute('miny'),
                    childElem.getAttribute('maxy'));
        }
    }
    if (xmlLayer.parentNode && xmlLayer.parentNode.tagName === 'Layer') {
        return parseGeoBounds(version, xmlLayer.parentNode);
    }
}

function parseSupportedFormats(version, xmlCapa) {
    if (version === '1.0.0') {
        return Array.prototype.map.call(
                xmlCapa.querySelectorAll('Capability > Request > Map > Format > *'),
                elm => mimeTypeByTagName[elm.tagName]);
    } else {
        return Array.prototype.map.call(
            xmlCapa.querySelectorAll('Capability > Request > GetMap > Format'),
            elm => elm.textContent.trim());
    }
}

function findXmlLayer(name, xml) {
    const layerNames = xml.querySelectorAll('Layer > Name');
    for (const n of layerNames) {
        if (n.textContent.trim() === name) {
            return n.parentNode;
        }
    }
}

function checkCapabilities(layer, xmlCapa) {
    const getCapLayer = findXmlLayer(layer.name, xmlCapa);

    if (!getCapLayer) {
        throw new Error(`Cannot find layer ${layer.name} in capabilities`);
    }

    // get CRS list
    const supportedCrs = parseSupportedCrs(layer.version, getCapLayer);

    if (layer.projection) {
        if (!supportedCrs.has(layer.projection)) {
            throw new Error(`Layer ${layer.name} does not support projection ${layer.projection}`);
        }
    } else if (supportedCrs.size !== 1) {
        throw new Error(`Cannot infer projection from capabilities for ${layer.name}`);
    } else {
        layer.projection = supportedCrs.values().next().value;
    }

    // check extent
    layer.validExtent = parseExtent(layer.version, layer.projection, getCapLayer);
    if (layer.extent && !layer.extent.isInside(layer.validExtent)) {
        layer.extent = layer.validExtent.intersect(layer.extent);
        const dimension = layer.extent.dimensions();
        if (dimension.x === 0 && dimension.y === 0) {
            throw new Error(`Layer.extent outside of validity extent for layer ${layer.name}`);
        }
    } else if (!layer.extent) {
        layer.extent = layer.validExtent.as(layer.projection);
    }

    // check format
    const supportedFormats = parseSupportedFormats(layer.version, xmlCapa);
    if (layer.format && !supportedFormats.includes(layer.format)) {
        throw new Error(`Declared layer.format ${layer.format} is not supported by the wms server for ${layer.name}`);
    } else if (!layer.format) {
        if (supportedFormats.length === 1) {
            layer.format = supportedFormats[0];
        } else {
            throw new Error('Please specify a format in layer.format');
        }
    }
}

/**
 * Return url wmts MNT
 * @param {String} options.url: service base url
 * @param {String} options.layer: requested data layer
 * @param {String} options.format: image format (default: format/jpeg)
 */
function WMS_Provider() {
}

WMS_Provider.prototype.url = function url(bbox, layer) {
    const box = bbox.as(layer.projection);
    const w = box.west();
    const s = box.south();
    const e = box.east();
    const n = box.north();

    const bboxInUnit = layer.axisOrder === 'swne' ?
        `${s},${w},${n},${e}` :
        `${w},${s},${e},${n}`;

    return layer.customUrl.replace('%bbox', bboxInUnit);
};

WMS_Provider.prototype.tileTextureCount = function tileTextureCount(tile, layer) {
    if (tile.extent.crs() == layer.projection) {
        return 1;
    } else {
        const tileMatrixSet = layer.options.tileMatrixSet;
        OGCWebServiceHelper.computeTileMatrixSetCoordinates(tile, tileMatrixSet);
        return tile.getCoordsForLayer(layer).length;
    }
};

WMS_Provider.prototype.preprocessDataLayer = function preprocessDataLayer(layer) {
    if (!layer.name) {
        throw new Error('layer.name is required.');
    }

    layer.options = layer.options || {};
    if (!layer.options.zoom) {
        layer.options.zoom = { min: 0, max: 21 };
    }

    if (!layer.format && layer.options.mimetype) {
        // eslint-disable-next-line no-console
        console.warn('layer.options.mimetype is deprecated, please use layer.format');
        layer.format = layer.options.mimetype;
    }
    layer.width = layer.heightMapWidth || 256;
    layer.version = layer.version || '1.3.0';
    layer.style = layer.style || '';
    layer.transparent = layer.transparent || false;

    const crsPropName = getCrsPropName(layer.version);

    if (layer.extent && !(layer.extent instanceof Extent) && layer.projection) {
        layer.extent = new Extent(layer.projection, layer.extent);
    }

    let getCapPromise;
    if (layer.disableGetCap) {
        getCapPromise = Promise.resolve();
        if (!layer.projection) {
            throw new Error('layer.projection is required');
        }
        if (!layer.extent && !layer.parentExtent) {
            throw new Error('layer.extent is required');
        }
        layer.format = layer.format || 'image/png';
    } else {
        getCapPromise = Fetcher.xml(`${layer.url}?service=WMS&version=${layer.version}&request=GetCapabilities`, layer.networkOptions)
            .then(xml => checkCapabilities(layer, xml));
    }

    return getCapPromise.then(() => {
        if (!layer.axisOrder) {
            // 4326 (lat/long) axis order depends on the WMS version used
            if (layer.projection == 'EPSG:4326') {
                // EPSG 4326 x = lat, long = y
                // version 1.1.0 long/lat while version 1.3.0 mandates xy (so lat,long)
                layer.axisOrder = (layer.version === '1.1.0' ? 'wsen' : 'swne');
            } else {
                // xy,xy order
                layer.axisOrder = 'wsen';
            }
        }

        layer.customUrl = `${layer.url
        }?SERVICE=WMS&REQUEST=GetMap&LAYERS=${layer.name
        }&VERSION=${layer.version
        }&STYLES=${layer.style
        }&FORMAT=${layer.format
        }&TRANSPARENT=${layer.transparent
        }&BBOX=%bbox` +
        `&${crsPropName}=${layer.projection
        }&WIDTH=${layer.width
        }&HEIGHT=${layer.width}`;
    });
};


WMS_Provider.prototype.tileInsideLimit = function tileInsideLimit(tile, layer) {
    return tile.level >= layer.options.zoom.min &&
        tile.level <= layer.options.zoom.max &&
        layer.extent.intersectsExtent(tile.extent);
};

WMS_Provider.prototype.getColorTexture = function getColorTexture(tile, layer, targetLevel, tileCoords) {
    if (!this.tileInsideLimit(tile, layer)) {
        return Promise.reject(`Tile '${tile}' is outside layer bbox ${layer.extent}`);
    }
    if (tile.material === null) {
        return Promise.resolve();
    }

    let extent = tileCoords ? tileCoords.as(layer.projection) : tile.extent;
    // if no specific level requester, use tile.level
    if (targetLevel === undefined) {
        targetLevel = tile.level;
    } else if (!tileCoords) {
        let parentAtLevel = tile;
        while (parentAtLevel && parentAtLevel.level > targetLevel) {
            parentAtLevel = parentAtLevel.parent;
        }
        if (!parentAtLevel) {
            return Promise.reject(`Invalid targetLevel requested ${targetLevel}`);
        }
        extent = parentAtLevel.extent;
        targetLevel = parentAtLevel.level;
    }

    const coords = extent.as(layer.projection);
    const url = this.url(coords, layer);
    const pitch = tileCoords ? new THREE.Vector4(0, 0, 1, 1) : tile.extent.offsetToParent(extent);
    const result = { pitch };

    return OGCWebServiceHelper.getColorTextureByUrl(url, layer.networkOptions).then((texture) => {
        result.texture = texture;
        result.texture.extent = extent;
        if (tileCoords) {
            result.texture.coords = tileCoords;
        } else {
            result.texture.coords = coords;
            // LayeredMaterial expects coords.zoom to exist, and describe the
            // precision of the texture (a la WMTS).
            result.texture.coords.zoom = targetLevel;
        }
        return result;
    });
};

WMS_Provider.prototype.executeCommand = function executeCommand(command) {
    const tile = command.requester;

    const layer = command.layer;
    const getTextureFunction = tile.extent.crs() == layer.projection ? this.getColorTexture : this.getColorTextures;
    const supportedFormats = {
        'image/png': getTextureFunction.bind(this),
        'image/jpg': getTextureFunction.bind(this),
        'image/jpeg': getTextureFunction.bind(this),
    };

    const func = supportedFormats[layer.format];

    if (func) {
        return func(tile, layer, command.targetLevel);
    } else {
        return Promise.reject(new Error(`Unsupported mimetype ${layer.format}`));
    }
};

// In the case where the tilematrixset of the tile don't correspond to the projection of the layer
// when the projection of the layer corresponds to a tilematrixset inside the tile, like the PM
WMS_Provider.prototype.getColorTextures = function getColorTextures(tile, layer, targetLevel) {
    if (tile.material === null) {
        return Promise.resolve();
    }
    const promises = [];
    for (const coord of tile.getCoordsForLayer(layer)) {
        promises.push(this.getColorTexture(tile, layer, targetLevel, coord));
    }

    return Promise.all(promises);
};

export default WMS_Provider;

// exported for testing
export const _testing = {
    findXmlLayer,
    parseSupportedFormats,
    parseSupportedCrs,
    parseExtent,
    checkCapabilities,
};
