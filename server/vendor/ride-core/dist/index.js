"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRideStats = exports.DEFAULT_CONFIG = exports.StatsAccumulator = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./geo"), exports);
__exportStar(require("./units"), exports);
var accumulator_1 = require("./accumulator");
Object.defineProperty(exports, "StatsAccumulator", { enumerable: true, get: function () { return accumulator_1.StatsAccumulator; } });
Object.defineProperty(exports, "DEFAULT_CONFIG", { enumerable: true, get: function () { return accumulator_1.DEFAULT_CONFIG; } });
var compute_1 = require("./compute");
Object.defineProperty(exports, "computeRideStats", { enumerable: true, get: function () { return compute_1.computeRideStats; } });
