import * as express from "express";
import RequestContext from "../kernel/RequestContext";

export type MiddlewareNext = express.NextFunction;
export type MiddlewareRequest = express.Request;

interface MiddlewareInterface {
  handle(req: MiddlewareRequest, context: RequestContext, next: MiddlewareNext);
}

export default MiddlewareInterface;
