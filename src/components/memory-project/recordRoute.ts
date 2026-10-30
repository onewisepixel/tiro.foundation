import { SPECIMEN_ROUTE } from "@/lib/livingTrace/projection";
import { RECORDS_BASE } from "./routes";

// The projection links a record to its Living Trace page; pages of the
// Living Archive open it in the Memory Project's record view instead. Any
// other link is returned unchanged. Server only, like the projection.
export const toRecordRoute = (href: string | null) => (href ? href.replace(SPECIMEN_ROUTE, RECORDS_BASE) : null);
