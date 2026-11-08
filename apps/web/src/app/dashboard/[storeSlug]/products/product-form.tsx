'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Archive, ImageOff, LoaderCircle, Plus, TriangleAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { humanise } from '@/lib/format';
import type { CatalogueMeta, ProductEdit } from '@/lib/types';

/**
 * The one form that creates and edits a piece.
 *
 * Deliberately one component rather than two. A jewellery product has around
 * forty fields with rules between them; two forms would drift, and the second
 * one to drift would be the one that silently stopped sending `netWeightG`.
 *
 * What it does *not* do is validate instead of the API. HTML constraints here
 * are there to catch a typo before a round trip; the API re-checks everything
 * and its field errors are what gets shown. A form that trusted itself would
 * be a form that an attacker simply skips.
 */

type Mode = 'create' | 'edit';

type FieldErrors = Record<string, string[]>;

interface MediaDraft {
  key: string;
  url: string;
  altText: string;
}

function draftsFrom(product: ProductEdit | null): MediaDraft[] {
  if (!product || product.media.length === 0) return [];
  return product.media.map((item, index) => ({
    key: `${item.id}-${index}`,
    url: item.url,
    altText: item.altText ?? '',
  }));
}

export function ProductForm({
  mode,
  storeId,
  storeSlug,
  meta,
  product,
  canWrite,
}: {
  mode: Mode;
  storeId: string;
  storeSlug: string;
  meta: CatalogueMeta;
  product: ProductEdit | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [media, setMedia] = useState<MediaDraft[]>(draftsFrom(product));
  const [metalType, setMetalType] = useState(product?.metalType ?? 'GOLD');
  const [pricingMode, setPricingMode] = useState(product?.pricingMode ?? 'FIXED');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'save' | 'archive' | null>(null);

  const purities = meta.purities[metalType] ?? [];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setSaved(false);
    setBusy('save');

    const form = new FormData(event.currentTarget);
    // A FormData entry is a string or a File. Every input on this form is
    // text, so a File can only mean the form grew a file input without this
    // function being updated - treated as empty rather than stringified into
    // '[object File]' and sent as a product name.
    const text = (key: string): string => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const flag = (key: string): boolean => form.get(key) === 'on';

    /**
     * An emptied field means different things in the two modes: on create
     * there is nothing to clear, so the key is left out and the column keeps
     * its default; on edit it is sent as null, which is the only way to
     * actually remove a value that is already there.
     */
    const optional = (key: string): string | null | undefined => {
      const value = text(key);
      if (value !== '') return value;
      return mode === 'create' ? undefined : null;
    };

    const payload: Record<string, unknown> = {
      name: text('name'),
      sku: text('sku'),
      jewelleryType: text('jewelleryType'),
      price: text('price'),
      status: text('status'),
      availability: text('availability'),
      metalType: text('metalType'),
      pricingMode: text('pricingMode'),
      makingChargeType: text('makingChargeType'),

      slug: mode === 'create' ? text('slug') || undefined : text('slug'),
      barcode: optional('barcode'),
      shortDescription: optional('shortDescription'),
      description: optional('description'),

      metalPurity: optional('metalPurity'),
      material: optional('material'),
      hallmarked: flag('hallmarked'),
      hallmarkNumber: optional('hallmarkNumber'),
      certificateUrl: optional('certificateUrl'),
      grossWeightG: optional('grossWeightG'),
      netWeightG: optional('netWeightG'),
      stoneWeightCt: optional('stoneWeightCt'),
      stoneType: optional('stoneType'),
      countryOfOrigin: optional('countryOfOrigin'),
      careInstructions: optional('careInstructions'),
      isCustomisable: flag('isCustomisable'),
      isCouplePair: flag('isCouplePair'),

      costPrice: optional('costPrice'),
      salePrice: optional('salePrice'),
      makingCharge: optional('makingCharge'),
      wastagePercent: optional('wastagePercent'),
      taxable: flag('taxable'),
      taxRate: optional('taxRate'),

      isFeatured: flag('isFeatured'),
      isNewArrival: flag('isNewArrival'),
      requiresShipping: flag('requiresShipping'),
      shipWeightG: optional('shipWeightG'),
      seoTitle: optional('seoTitle'),
      seoDesc: optional('seoDesc'),
      tags: text('tags')
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),

      primaryCategoryId: optional('primaryCategoryId'),
      brandId: optional('brandId'),

      media: media
        .filter((item) => item.url.trim() !== '')
        .map((item) => ({
          url: item.url.trim(),
          ...(item.altText.trim() !== '' ? { altText: item.altText.trim() } : {}),
        })),
    };

    const url =
      mode === 'create'
        ? `/api/stores/${storeId}/products`
        : `/api/stores/${storeId}/products/${product?.id ?? ''}`;

    try {
      const response = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = readFailure(body);
        setErrors(parsed.details);
        setMessage(parsed.message);
        setBusy(null);
        return;
      }

      if (mode === 'create') {
        const created = body as { id: string };
        router.replace(`/dashboard/${storeSlug}/products/${created.id}?created=1`);
        router.refresh();
        return;
      }

      setSaved(true);
      setBusy(null);
      router.refresh();
    } catch {
      setMessage('Cannot reach the server.');
      setBusy(null);
    }
  }

  async function onArchive() {
    if (!product) return;
    setMessage(null);
    setBusy('archive');
    try {
      const response = await fetch(`/api/stores/${storeId}/products/${product.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setMessage(readFailure(body).message);
        setBusy(null);
        return;
      }
      router.push(`/dashboard/${storeSlug}/products`);
      router.refresh();
    } catch {
      setMessage('Cannot reach the server.');
      setBusy(null);
    }
  }

  const readOnly = !canWrite;

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-10" noValidate>
      {message && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-line bg-parchment-deep p-3 text-sm text-ink"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          {message}
        </p>
      )}
      {saved && (
        <p className="border border-gold/50 bg-gold-wash p-3 text-sm text-gold-deep">Saved.</p>
      )}

      <Section title="The piece">
        <Field
          id="name"
          label="Name"
          required
          maxLength={200}
          defaultValue={product?.name ?? ''}
          errors={errors}
          disabled={readOnly}
          placeholder="22K Gold Kada Bangle"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="sku"
            label="SKU"
            required
            maxLength={48}
            defaultValue={product?.sku ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="The shop's own code. Unique within this shop."
            placeholder="AUR-BNG-22K-001"
          />
          <Field
            id="barcode"
            label="Barcode (optional)"
            maxLength={64}
            defaultValue={product?.barcode ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <SelectField
            id="jewelleryType"
            label="Type"
            required
            options={meta.options.jewelleryType}
            defaultValue={product?.jewelleryType ?? 'RING'}
            errors={errors}
            disabled={readOnly}
          />
          <SelectField
            id="status"
            label="Status"
            options={meta.options.status}
            defaultValue={product?.status ?? 'DRAFT'}
            errors={errors}
            disabled={readOnly}
            hint="Only ACTIVE shows on the storefront."
          />
          <SelectField
            id="availability"
            label="Availability"
            options={meta.options.availability}
            defaultValue={product?.availability ?? 'IN_STOCK'}
            errors={errors}
            disabled={readOnly}
          />
        </div>
        <Field
          id="shortDescription"
          label="One-line description (optional)"
          maxLength={300}
          defaultValue={product?.shortDescription ?? ''}
          errors={errors}
          disabled={readOnly}
          placeholder="Hand-finished kada with a hinged clasp"
        />
        <TextArea
          id="description"
          label="Full description (optional)"
          rows={5}
          maxLength={8000}
          defaultValue={product?.description ?? ''}
          errors={errors}
          disabled={readOnly}
          hint="Plain text. Formatting is not stored yet — HTML would need a sanitiser before the storefront could be allowed to render it."
        />
      </Section>

      <Section title="Metal and weight">
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="metalType"
            label="Metal"
            options={meta.options.metalType}
            defaultValue={product?.metalType ?? 'GOLD'}
            errors={errors}
            disabled={readOnly}
            onValueChange={setMetalType}
          />
          <div>
            <label htmlFor="metalPurity" className="eyebrow mb-1.5 block">
              Purity
            </label>
            <input
              id="metalPurity"
              name="metalPurity"
              list="purity-options"
              maxLength={20}
              defaultValue={product?.metalPurity ?? ''}
              disabled={readOnly}
              className={inputClass}
              placeholder={purities[0]?.code ?? '22K'}
            />
            <datalist id="purity-options">
              {purities.map((purity) => (
                <option key={purity.code} value={purity.code}>
                  {purity.label}
                </option>
              ))}
            </datalist>
            <Hint>
              {purities.length > 0
                ? `Suggestions for ${humanise(metalType)}; any value is accepted.`
                : 'This metal has no standard fineness to declare.'}
            </Hint>
            <FieldError id="metalPurity" errors={errors} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            id="grossWeightG"
            label="Gross weight (g)"
            type="number"
            step="0.001"
            min="0"
            defaultValue={product?.grossWeightG ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="Everything, metal and stones."
          />
          <Field
            id="netWeightG"
            label="Net metal weight (g)"
            type="number"
            step="0.001"
            min="0"
            defaultValue={product?.netWeightG ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="Metal only. Drives rate-based pricing."
          />
          <Field
            id="shipWeightG"
            label="Shipping weight (g)"
            type="number"
            step="0.001"
            min="0"
            defaultValue={product?.shipWeightG ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="With the box, if it differs."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="material"
            label="Material (optional)"
            maxLength={120}
            defaultValue={product?.material ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="Free text, for artificial or non-metal pieces."
          />
          <Field
            id="countryOfOrigin"
            label="Country of origin (optional)"
            maxLength={80}
            defaultValue={product?.countryOfOrigin ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Check
            id="hallmarked"
            label="Hallmarked"
            defaultChecked={product?.hallmarked ?? false}
            disabled={readOnly}
          />
          <Field
            id="hallmarkNumber"
            label="Hallmark number (optional)"
            maxLength={80}
            defaultValue={product?.hallmarkNumber ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>
        <Field
          id="certificateUrl"
          label="Certificate address (optional)"
          maxLength={2048}
          defaultValue={product?.certificateUrl ?? ''}
          errors={errors}
          disabled={readOnly}
          hint="https:// link to the assay or grading certificate."
        />
      </Section>

      <Section title="Stones">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="stoneType"
            label="Stone (optional)"
            maxLength={120}
            defaultValue={product?.stoneType ?? ''}
            errors={errors}
            disabled={readOnly}
            placeholder="Ruby, Diamond"
          />
          <Field
            id="stoneWeightCt"
            label="Stone weight (ct)"
            type="number"
            step="0.001"
            min="0"
            defaultValue={product?.stoneWeightCt ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>
        <Hint>
          Individual stones with shape, clarity and certification are a later slice; this is the
          summary the storefront shows.
        </Hint>
      </Section>

      <Section title="Price">
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="pricingMode"
            label="How the price is set"
            options={meta.options.pricingMode}
            defaultValue={product?.pricingMode ?? 'FIXED'}
            errors={errors}
            disabled={readOnly}
            onValueChange={setPricingMode}
          />
          <Field
            id="price"
            label={`Selling price (${meta.store.currency})`}
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.price ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>

        {pricingMode === 'METAL_RATE_BASED' && (
          <p className="border border-line bg-parchment-deep p-3 text-xs leading-relaxed text-ink-soft">
            Rate-based pricing needs the net metal weight, and recalculates from the day&rsquo;s
            metal rate when that is wired up. Until then the price above is what customers see — the
            rate table is seeded but nothing recomputes from it yet.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="salePrice"
            label="Sale price (optional)"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.salePrice ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="Has to be below the selling price."
          />
          <Field
            id="costPrice"
            label="Cost price (optional)"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.costPrice ?? ''}
            errors={errors}
            disabled={readOnly}
            hint="Your purchase price. Never shown to customers."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            id="makingCharge"
            label="Making charge (optional)"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.makingCharge ?? ''}
            errors={errors}
            disabled={readOnly}
          />
          <SelectField
            id="makingChargeType"
            label="Charged as"
            options={meta.options.makingChargeType}
            defaultValue={product?.makingChargeType ?? 'FLAT'}
            errors={errors}
            disabled={readOnly}
          />
          <Field
            id="wastagePercent"
            label="Wastage %"
            type="number"
            step="0.001"
            min="0"
            max="100"
            defaultValue={product?.wastagePercent ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Check
            id="taxable"
            label="VAT applies"
            defaultChecked={product?.taxable ?? false}
            disabled={readOnly}
          />
          <Field
            id="taxRate"
            label="VAT rate %"
            type="number"
            step="0.001"
            min="0"
            max="100"
            defaultValue={product?.taxRate ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>
      </Section>

      <Section title="Pictures">
        {!meta.mediaUploadEnabled && (
          <p className="border border-line bg-parchment-deep p-3 text-xs leading-relaxed text-ink-soft">
            Uploading from your computer needs a storage provider (Cloudinary or S3) configured, and
            this install has none — see <code className="font-mono">docs/08-roadmap.md</code>. Give
            addresses instead: an <code className="font-mono">https://</code> link, or a path like{' '}
            <code className="font-mono">/demo/ring.svg</code> for a file in{' '}
            <code className="font-mono">apps/web/public</code>. The first picture is the one used on
            cards and search results.
          </p>
        )}

        <ul className="space-y-3">
          {media.map((item, index) => (
            <li key={item.key} className="flex items-start gap-3 border border-line p-3">
              <span className="relative block h-16 w-16 shrink-0 overflow-hidden border border-line bg-parchment-deep">
                {item.url.trim() !== '' ? (
                  /*
                   * A plain <img>, not next/image: this is an address the shop
                   * is typing right now, and next/image refuses a remote host
                   * that is not listed in next.config. The preview has to work
                   * before the save, including for a host nobody anticipated.
                   */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageOff
                    className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
                    strokeWidth={1.5}
                  />
                )}
              </span>
              <div className="grow space-y-2">
                <input
                  value={item.url}
                  onChange={(event) =>
                    setMedia((rows) =>
                      rows.map((row, position) =>
                        position === index ? { ...row, url: event.target.value } : row,
                      ),
                    )
                  }
                  disabled={readOnly}
                  placeholder="/demo/ring.svg or https://…"
                  className={inputClass}
                  aria-label={`Picture ${index + 1} address`}
                />
                <input
                  value={item.altText}
                  onChange={(event) =>
                    setMedia((rows) =>
                      rows.map((row, position) =>
                        position === index ? { ...row, altText: event.target.value } : row,
                      ),
                    )
                  }
                  disabled={readOnly}
                  maxLength={200}
                  placeholder="Describe the picture for screen readers (optional)"
                  className={inputClass}
                  aria-label={`Picture ${index + 1} description`}
                />
                <FieldError id={`media.${index}.url`} errors={errors} />
                {index === 0 && <Hint>Used as the main picture.</Hint>}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setMedia((rows) => rows.filter((_, p) => p !== index))}
                  className="text-ink-faint hover:text-ink"
                  aria-label={`Remove picture ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && media.length < 12 && (
          <button
            type="button"
            onClick={() =>
              setMedia((rows) => [
                ...rows,
                { key: `new-${Date.now()}-${rows.length}`, url: '', altText: '' },
              ])
            }
            className="inline-flex items-center gap-1.5 border border-line px-3 py-2 text-sm text-ink hover:border-gold hover:text-gold-deep"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add a picture
          </button>
        )}
        <FieldError id="media" errors={errors} />
      </Section>

      <Section title="Where it appears">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="primaryCategoryId" className="eyebrow mb-1.5 block">
              Category (optional)
            </label>
            <select
              id="primaryCategoryId"
              name="primaryCategoryId"
              defaultValue={product?.primaryCategoryId ?? ''}
              disabled={readOnly}
              className={inputClass}
            >
              <option value="">None</option>
              {meta.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentName ? `${category.parentName} › ` : ''}
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError id="primaryCategoryId" errors={errors} />
          </div>
          <div>
            <label htmlFor="brandId" className="eyebrow mb-1.5 block">
              Brand (optional)
            </label>
            <select
              id="brandId"
              name="brandId"
              defaultValue={product?.brandId ?? ''}
              disabled={readOnly}
              className={inputClass}
            >
              <option value="">None</option>
              {meta.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <FieldError id="brandId" errors={errors} />
          </div>
        </div>

        <Field
          id="tags"
          label="Tags (optional)"
          defaultValue={product?.tags.join(', ') ?? ''}
          errors={errors}
          disabled={readOnly}
          hint="Separated by commas. Customers can search these."
          placeholder="bridal, kada, handmade"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Check
            id="isFeatured"
            label="Feature on the home page"
            defaultChecked={product?.isFeatured ?? false}
            disabled={readOnly}
          />
          <Check
            id="isNewArrival"
            label="Mark as a new arrival"
            defaultChecked={product?.isNewArrival ?? false}
            disabled={readOnly}
          />
          <Check
            id="isCustomisable"
            label="Can be made to order"
            defaultChecked={product?.isCustomisable ?? false}
            disabled={readOnly}
          />
          <Check
            id="isCouplePair"
            label="Sold as a couple's pair"
            defaultChecked={product?.isCouplePair ?? false}
            disabled={readOnly}
          />
          <Check
            id="requiresShipping"
            label="Needs shipping"
            defaultChecked={product?.requiresShipping ?? true}
            disabled={readOnly}
          />
        </div>
      </Section>

      <details className="border-t border-line pt-6">
        <summary className="eyebrow cursor-pointer">Web address, search and care</summary>
        <div className="mt-5 space-y-5">
          <Field
            id="slug"
            label={mode === 'create' ? 'Web address (optional)' : 'Web address'}
            maxLength={80}
            defaultValue={product?.slug ?? ''}
            errors={errors}
            disabled={readOnly}
            hint={
              mode === 'create'
                ? 'Left empty, it is made from the name.'
                : 'Changing this breaks any link a customer saved.'
            }
          />
          <Field
            id="seoTitle"
            label="Search title (optional)"
            maxLength={70}
            defaultValue={product?.seoTitle ?? ''}
            errors={errors}
            disabled={readOnly}
          />
          <Field
            id="seoDesc"
            label="Search description (optional)"
            maxLength={160}
            defaultValue={product?.seoDesc ?? ''}
            errors={errors}
            disabled={readOnly}
          />
          <TextArea
            id="careInstructions"
            label="Care instructions (optional)"
            rows={3}
            maxLength={1000}
            defaultValue={product?.careInstructions ?? ''}
            errors={errors}
            disabled={readOnly}
          />
        </div>
      </details>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <Button type="submit" size="lg" disabled={busy !== null}>
            {busy === 'save' && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />}
            {busy === 'save' ? 'Saving…' : mode === 'create' ? 'Create the piece' : 'Save changes'}
          </Button>

          <Link
            href={`/dashboard/${storeSlug}/products`}
            className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Cancel
          </Link>

          {mode === 'edit' && product && !product.archived && (
            <button
              type="button"
              onClick={() => void onArchive()}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-50"
            >
              {busy === 'archive' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <Archive className="h-4 w-4" strokeWidth={1.5} />
              )}
              Archive
            </button>
          )}
        </div>
      )}

      {readOnly && (
        <p className="border-t border-line pt-6 text-sm text-ink-soft">
          Your role can read the catalogue but not change it, so this is a read-only view.
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pieces of the form
// ---------------------------------------------------------------------------

const inputClass =
  'w-full border border-line bg-white/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold disabled:bg-parchment-deep disabled:text-ink-soft';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <legend className="eyebrow mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-ink-faint">{children}</p>;
}

/** The API's message for one field, if it sent one. */
function FieldError({ id, errors }: { id: string; errors: FieldErrors }) {
  const messages = errors[id];
  if (!messages || messages.length === 0) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-gold-deep">
      {messages.join(' ')}
    </p>
  );
}

function Field({
  id,
  label,
  hint,
  errors,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  errors: FieldErrors;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <input id={id} name={id} className={inputClass} {...props} />
      {hint && <Hint>{hint}</Hint>}
      <FieldError id={id} errors={errors} />
    </div>
  );
}

function TextArea({
  id,
  label,
  hint,
  errors,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  errors: FieldErrors;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <textarea id={id} name={id} className={inputClass} {...props} />
      {hint && <Hint>{hint}</Hint>}
      <FieldError id={id} errors={errors} />
    </div>
  );
}

function SelectField({
  id,
  label,
  hint,
  options,
  errors,
  onValueChange,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  options: string[];
  errors: FieldErrors;
  onValueChange?: (value: string) => void;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'>) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <select
        id={id}
        name={id}
        className={inputClass}
        onChange={(event) => onValueChange?.(event.target.value)}
        {...props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {humanise(option)}
          </option>
        ))}
      </select>
      {hint && <Hint>{hint}</Hint>}
      <FieldError id={id} errors={errors} />
    </div>
  );
}

function Check({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 text-sm text-ink">
      <input
        id={id}
        name={id}
        type="checkbox"
        className="h-4 w-4 accent-gold-deep disabled:opacity-50"
        {...props}
      />
      {label}
    </label>
  );
}

/** Reads the message and per-field details out of an error response. */
function readFailure(body: unknown): { message: string; details: FieldErrors } {
  if (typeof body !== 'object' || body === null) {
    return { message: 'Could not save the piece.', details: {} };
  }
  const shape = body as { message?: unknown; details?: unknown };
  return {
    message: typeof shape.message === 'string' ? shape.message : 'Could not save the piece.',
    details:
      typeof shape.details === 'object' && shape.details !== null
        ? (shape.details as FieldErrors)
        : {},
  };
}
