/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import * as estree from 'estree';
import {Iterable as IterableX} from 'ix';
import * as jsc from 'jscodeshift';
import {Analysis, Document} from 'polymer-analyzer';

import {DocumentConverter} from './document-converter';
import {ConversionOutput, JsExport} from './js-module';
import {ConvertedDocumentUrl, convertHtmlDocumentUrl, getDocumentUrl, OriginalDocumentUrl} from './url-converter';
import {getNamespaces} from './util';

export interface BaseConverterOptions {
  /**
   * Namespace names used to detect exports. Namespaces declared in the
   * code with an @namespace declaration are automatically detected.
   */
  readonly namespaces?: Iterable<string>;

  /**
   * Files to exclude from conversion (ie lib/utils/boot.html). Imports
   * to these files are also excluded.
   */
  readonly excludes?: Iterable<string>;

  /**
   * Namespace references (ie, Polymer.DomModule) to "exclude"" be replacing
   * the entire reference with `undefined`.
   *
   * These references would normally be rewritten to module imports, but in some
   * cases they are accessed without importing. The presumption is that access
   * is guarded by a conditional and replcing with `undefined` will safely
   * fail the guard.
   */
  readonly referenceExcludes?: Iterable<string>;
}

export abstract class BaseConverter {
  protected readonly _analysis: Analysis;
  readonly namespaces: ReadonlySet<string>;

  readonly excludes: ReadonlySet<string>;
  readonly includes: ReadonlySet<string>;
  readonly referenceRewrites: ReadonlyMap<string, estree.Node>;
  readonly dangerousReferences: ReadonlyMap<string, string>;
  readonly referenceExcludes: ReadonlySet<string>;

  readonly outputs = new Map<ConvertedDocumentUrl, ConversionOutput>();
  readonly namespacedExports = new Map<string, JsExport>();

  constructor(analysis: Analysis, options: BaseConverterOptions) {
    this._analysis = analysis;
    this.namespaces =
        new Set(getNamespaces(analysis).concat(options.namespaces || []));

    const referenceRewrites = new Map<string, estree.Node>();
    const windowDotDocument = jsc.memberExpression(
        jsc.identifier('window'), jsc.identifier('document'));
    referenceRewrites.set(
        'document.currentScript.ownerDocument', windowDotDocument);
    this.referenceRewrites = referenceRewrites;

    const dangerousReferences = new Map<string, string>();
    dangerousReferences.set(
        'document.currentScript',
        `document.currentScript is always \`null\` in an ES6 module.`);
    this.dangerousReferences = dangerousReferences;

    this.excludes = new Set(options.excludes!);
    this.referenceExcludes = new Set(options.referenceExcludes!);

    const importedFiles = IterableX
                              .from(this._analysis.getFeatures(
                                  {kind: 'import', externalPackages: false}))
                              .map((imp) => imp.url)
                              .filter(
                                  (url) =>
                                      !(url.startsWith('bower_components') ||
                                        url.startsWith('node_modules')));
    this.includes = new Set(importedFiles);
  }

  async convert(): Promise<Map<ConvertedDocumentUrl, string|undefined>> {
    const htmlDocuments =
        [...this._analysis.getFeatures({kind: 'html-document'})]
            // Excludes
            .filter((d) => {
              return !this.excludes.has(d.url) && d.url && this.filter(d);
            });

    const results = new Map<ConvertedDocumentUrl, string|undefined>();

    for (const document of htmlDocuments) {
      try {
        this.includes.has(document.url) ?
            this.convertDocument(document, new Set()) :
            this.convertHtmlToHtml(document, new Set());
      } catch (e) {
        console.error(`Error in ${document.url}`, e);
      }
    }

    for (const convertedModule of this.outputs.values()) {
      if (convertedModule.url.endsWith('shadycss/entrypoints/apply-shim.js') ||
          convertedModule.url.endsWith(
              'shadycss/entrypoints/custom-style-interface.js')) {
        // These are already ES6, and messed with in url-converter.
        continue;
      }
      if (convertedModule.type === 'delete-file') {
        results.set(convertedModule.url, undefined);
      } else {
        results.set(convertedModule.url, convertedModule.source);
      }
    }

    return results;
  }

  /**
   * Converts a Polymer Analyzer HTML document to a JS module
   */
  convertDocument(document: Document, visited: Set<OriginalDocumentUrl>) {
    const jsUrl = convertHtmlDocumentUrl(getDocumentUrl(document));
    if (!this.outputs.has(jsUrl)) {
      const newModules =
          this.getDocumentConverter(document, visited).convertToJsModule();
      this.handleNewJsModules(newModules);
    }
  }

  /**
   * Converts HTML Imports and inline scripts to module scripts as necessary.
   */
  convertHtmlToHtml(document: Document, visited: Set<OriginalDocumentUrl>) {
    const htmlUrl = `./${document.url}` as ConvertedDocumentUrl;
    if (!this.outputs.has(htmlUrl)) {
      const newModules = this.getDocumentConverter(document, visited)
                             .convertAsToplevelHtmlDocument();
      this.handleNewJsModules(newModules);
    }
  }

  private handleNewJsModules(outputs: Iterable<ConversionOutput>): void {
    for (const output of outputs) {
      this.outputs.set(output.url, output);
      if (output.type === 'js-module') {
        for (const expr of output.exportedNamespaceMembers) {
          this.namespacedExports.set(
              expr.oldNamespacedName,
              new JsExport(output.url, expr.es6ExportName));
        }
      }
    }
  }

  protected filter(_document: Document) {
    return true;
  }
  protected abstract getDocumentConverter(
      document: Document, visited: Set<OriginalDocumentUrl>): DocumentConverter;
}
