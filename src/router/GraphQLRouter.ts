import * as express from "express";
import * as glob from "glob";

import { mergeTypes } from "merge-graphql-schemas";
import { ApolloServer, SchemaDirectiveVisitor } from "apollo-server-express";

import RouterInterface from "../interface/RouterInterface";
import { Metadata } from "../kernel/MetadataCollector";
import { logger } from "../helper";
import { GraphQLExtension } from "graphql-extensions";
import { GraphQLScalarType, print } from "graphql";

class LogExtension<TContext = any> implements GraphQLExtension<TContext> {
  private startTime: number;

  requestDidStart(o) {
    this.startTime = new Date().getTime();
  }
  willSendResponse(options) {
    let elapsedTime = new Date().getTime() - this.startTime;
    let unit = "ms";
    if (elapsedTime > 1000) {
      elapsedTime /= 1000;
      unit = "s";
    }

    const loggedQuery = options.queryString || print(options.parsedQuery);
    logger().info(`GraphQL Request ${elapsedTime}${unit} `);
    if (options.graphqlResponse.errors) {
      options.graphqlResponse.errors.forEach((err: Error) => {
        logger().error(err.stack);
      });
    }
  }
}

class GraphQLRouter implements RouterInterface {
  private queries = [];
  private mutations = [];
  private fields = {};
  private types: { [key: string]: GraphQLScalarType };
  private typedefs = [];
  private server: ApolloServer;
  private directives: Record<string, typeof SchemaDirectiveVisitor> = {};

  constructor(conf: {
    schemaPath: string;
    directives?: Record<string, typeof SchemaDirectiveVisitor>;
    types: { [key: string]: GraphQLScalarType };
  }) {
    // Automatically load the schema
    const files = glob.sync(conf.schemaPath + "/**/*.ts");
    for (let path of files) {
      const typedef = require(path).default;
      if (typedef && typeof typedef === "string" && typedef.length > 0)
        this.typedefs.push(require(path).default);
    }

    this.directives = conf.directives;
    this.types = conf.types;
  }

  receiveMetadata(instance: object, metadata: Metadata[]) {
    for (let data of metadata) {
      if (data.type === "query") {
        this.queries.push({
          ...data,
          instance
        });
      } else if (data.type === "mutation") {
        this.mutations.push({
          ...data,
          instance
        });
      } else if (data.type === "field") {
        if (!this.fields[data.entity]) {
          this.fields[data.entity] = {};
        }

        this.fields[data.entity][data.field] = {
          ...data,
          instance
        };
      }
    }
  }

  integrate(app: express.Application) {
    const queryHandlers = {};
    const mutationHandlers = {};

    this.queries.forEach(obj => {
      queryHandlers[obj.name] = (parent, args, context, info) => {
        return this.callInstance(
          obj.instance,
          obj.methodName,
          parent,
          args,
          context,
          info
        );
      };
    });
    this.mutations.forEach(obj => {
      mutationHandlers[obj.name] = (parent, args, context, info) => {
        return this.callInstance(
          obj.instance,
          obj.methodName,
          parent,
          args,
          context,
          info
        );
      };
    });

    this.server = new ApolloServer({
      // @ts-ignore
      typeDefs: mergeTypes(this.typedefs, { all: true }),
      resolvers: {
        Query: queryHandlers,
        Mutation: mutationHandlers,
        ...this.buildTypes()
      },
      schemaDirectives: this.directives,
      extensions: [() => new LogExtension()],
      context: ({ res }) => {
        return res.locals.app;
      }
    });

    this.server.applyMiddleware({
      app
    });
  }

  /**
   * Build the list of types, which correspond to the different fields
   */
  private buildTypes() {
    const types = {};

    Object.keys(this.fields).forEach(key => {
      const data = this.fields[key];

      if (!types[key]) {
        types[key] = {};
      }

      Object.keys(data).forEach(fieldName => {
        const data = this.fields[key][fieldName];
        types[key][fieldName] = (entity, args, context, info) => {
          return this.callFieldResolver(
            data.instance,
            data.methodName,
            entity,
            args,
            context,
            info
          );
        };
      });
    });

    return {
      ...types,
      ...this.types
    };
  }

  private callInstance(instance, method, parent, args, context, info) {
    return instance[method](args, context, info, parent);
  }

  private callFieldResolver(instance, method, entity, args, context, info) {
    return instance[method](entity, args, context, info);
  }
}

export default GraphQLRouter;
