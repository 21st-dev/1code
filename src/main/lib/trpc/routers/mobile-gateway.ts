import { readDesktopMobileGatewayPairingStatus } from "../../mobile-gateway/desktop-state"
import { publicProcedure, router } from "../index"

export const mobileGatewayRouter = router({
  getPairingStatus: publicProcedure.query(() =>
    readDesktopMobileGatewayPairingStatus(),
  ),
})
