import { useState, useCallback, useActionState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2 } from 'lucide-react'
import { PageContainer } from '../components/layout'
import { Card, CardHeader, Button, Input, Textarea, ImageUpload } from '../components/ui'
import { useRestaurantStore, selectRestaurant } from '../stores/restaurantStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { toast } from '../stores/toastStore'
import { validateRestaurant, type ValidationErrors } from '../utils/validation'
import { handleError } from '../utils/logger'
import { helpContent } from '../utils/helpContent'
import type { RestaurantFormData } from '../types'

// REACT 19 IMPROVEMENT: Form action state type
type FormState = {
  errors?: ValidationErrors<RestaurantFormData>
  message?: string
  isSuccess?: boolean
}

export function RestaurantPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.restaurant.title'))

  // Use selectors to avoid unnecessary re-renders
  const restaurant = useRestaurantStore(selectRestaurant)
  const createRestaurant = useRestaurantStore((s) => s.createRestaurant)
  const updateRestaurant = useRestaurantStore((s) => s.updateRestaurant)

  // LINT FIX: Compute initial form data from restaurant instead of using useEffect
  const initialFormData = useMemo((): RestaurantFormData => ({
    name: restaurant?.name ?? '',
    slug: restaurant?.slug ?? '',
    description: restaurant?.description ?? '',
    logo: restaurant?.logo ?? '',
    banner: restaurant?.banner ?? '',
    theme_color: restaurant?.theme_color ?? 'var(--primary-500)',
    address: restaurant?.address ?? '',
    phone: restaurant?.phone ?? '',
    email: restaurant?.email ?? '',
  }), [restaurant])

  const [formData, setFormData] = useState<RestaurantFormData>(initialFormData)

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      // Extract data from FormData
      const data: RestaurantFormData = {
        name: formData.get('name') as string,
        slug: formData.get('slug') as string,
        description: formData.get('description') as string,
        logo: formData.get('logo') as string,
        banner: formData.get('banner') as string,
        theme_color: formData.get('theme_color') as string,
        address: formData.get('address') as string,
        phone: formData.get('phone') as string,
        email: formData.get('email') as string,
      }

      const validation = validateRestaurant(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (restaurant) {
          updateRestaurant(data)
          toast.success(t('toasts.updateSuccess', { entity: t('pages.restaurant.title') }))
        } else {
          createRestaurant(data)
          toast.success(t('toasts.createSuccess', { entity: t('pages.restaurant.title') }))
        }
        return { isSuccess: true, message: t('toasts.savedSuccessfully') }
      } catch (error) {
        const message = handleError(error, 'RestaurantPage.submitAction')
        toast.error(t('toasts.saveError', { entity: t('pages.restaurant.title').toLowerCase(), message }))
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [restaurant, updateRestaurant, createRestaurant]
  )

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    submitAction,
    { isSuccess: false }
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target
      setFormData((prev) => ({ ...prev, [name]: value }))
    },
    []
  )

  const generateSlug = useCallback(() => {
    const slug = formData.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
    setFormData((prev) => ({ ...prev, slug }))
  }, [formData.name])

  return (
    <PageContainer
      title={t('pages.restaurant.title')}
      description={t('pages.restaurant.description')}
      helpContent={helpContent.restaurant}
    >
      <form action={formAction} className="max-w-4xl">
        <Card className="mb-6">
          <CardHeader
            title={t('pages.restaurant.generalInfo')}
            description={t('pages.restaurant.generalInfoDesc')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label={t('pages.restaurant.restaurantName')}
              name="name"
              value={formData.name}
              onChange={handleChange}
              onBlur={() => !formData.slug && generateSlug()}
              placeholder="Mi Restaurante"
              error={state.errors?.name}
            />

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  label={t('pages.restaurant.slug')}
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  placeholder="mi-restaurante"
                  error={state.errors?.slug}
                  helperText="Se usara en la URL del menu"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-7"
                onClick={generateSlug}
              >
                {t('pages.restaurant.generate')}
              </Button>
            </div>

            <div className="md:col-span-2">
              <Textarea
                label={t('common.description')}
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descripcion del restaurante..."
                error={state.errors?.description}
                rows={3}
              />
            </div>

            <Input
              label="Color Principal"
              name="theme_color"
              type="color"
              value={formData.theme_color}
              onChange={handleChange}
              className="h-10 p-1"
            />
          </div>
        </Card>

        <Card className="mb-6">
          <CardHeader
            title={t('pages.restaurant.images')}
            description={t('pages.restaurant.imagesDesc')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUpload
              label={t('pages.restaurant.logo')}
              value={formData.logo}
              onChange={(url) => setFormData((prev) => ({ ...prev, logo: url }))}
            />

            <ImageUpload
              label={t('pages.restaurant.banner')}
              value={formData.banner}
              onChange={(url) => setFormData((prev) => ({ ...prev, banner: url }))}
            />
          </div>
        </Card>

        <Card className="mb-6">
          <CardHeader
            title={t('pages.restaurant.contact')}
            description={t('pages.restaurant.contactDesc')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label={t('common.address')}
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Calle 123, Ciudad"
              error={state.errors?.address}
            />

            <Input
              label={t('common.phone')}
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+54 11 1234-5678"
              error={state.errors?.phone}
            />

            <Input
              label={t('common.email')}
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="contacto@restaurante.com"
              error={state.errors?.email}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" isLoading={isPending} leftIcon={<Building2 className="w-4 h-4" />}>
            {restaurant ? t('common.save') : t('common.create')}
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}

export default RestaurantPage
