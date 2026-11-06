"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformAccess = platformAccess;
/** Platform access is independent of legacy subscription and balance records. */
function platformAccess() {
    return { allowed: true, trial: false, cost: 0, billingEnabled: false };
}
//# sourceMappingURL=platformAccess.js.map