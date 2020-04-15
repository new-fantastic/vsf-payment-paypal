import { createModule } from '@vue-storefront/core/lib/module'
import { module } from './store'
import { afterRegistration } from './hooks/afterRegistration'

export const KEY = 'payment-paypal-magento2'

export const Paypal = createModule({
  key: KEY,
  store: { modules: [{ key: KEY, module }] },
  afterRegistration
})
