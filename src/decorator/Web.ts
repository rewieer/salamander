import MetadataCollector, { Metadata } from "../kernel/MetadataCollector";

export interface WebMetata extends Metadata {
  name: string;
  path: string;
  method: string;
}

/**
 * Represent a Web Query
 * @param params
 * @constructor
 */
export default function Web(params: {
  name: string;
  path: string;
  method: string;
}) {
  return function(target, method) {
    MetadataCollector.add({
      type: "web",
      target: target.constructor,
      methodName: method,
      name: params.name,
      path: params.path,
      method: params.method
    });
  };
}
