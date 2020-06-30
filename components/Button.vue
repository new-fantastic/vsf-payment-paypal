<template>
  <BaseLoader v-if="loadingBtn" />
  <div
    v-else
    class="paypal-button"
    :class="{'paypal-button--disabled': disabled}"
  />
</template>

<script>
import store from '@vue-storefront/core/store'
import { currentStoreView } from '@vue-storefront/core/lib/multistore'
import config from 'config'

export default {
  name: 'PaypalButton',
  props: {
    styling: {
      type: Object,
      required: false,
      default: () => ({
        layout: 'vertical',
        color: 'gold',
        shape: 'pill',
        label: 'paypal'
      })
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  data () {
    const storeView = currentStoreView()
    return {
      tokenId: null,
      currencyCode: storeView.i18n.currencyCode,
      locale: storeView.i18n.defaultLocale.replace('-', '_'), // Converting to PayPal format,
      loadingBtn: true
    }
  },
  mounted () {
    this.setButtonAndTotals()
  },
  computed: {
    platformTotal () {
      return this.$store.state.cart.platformTotalSegments
    }
  },
  methods: {
    setButtonAndTotals () {
      this.loadingBtn = true
      const storeView = currentStoreView()
      const { currencyCode } = storeView.i18n
      const clientId = config.paypal.clientId
      const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currencyCode}&disable-funding=card,credit&intent=authorize`
      var script = document.createElement('script')
      script.setAttribute('src', sdkUrl)
      script.onload = () => {
        this.loadingBtn = false
        this.$nextTick(() => {
          window.paypal.Buttons({
            style: this.styling,
            createOrder: this.createOrderNvp,
            onApprove: this.onApprove
          }).render('.paypal-button')
        })
      }
      document.head.appendChild(script)
    },
    getSegmentTotal (name) {
      const total = this.platformTotal.filter(segment => {
        return segment.code === name
      })
      if (total.length > 0) {
        return Math.abs(parseFloat(total[0].value).toFixed(2))
      } else {
        return 0
      }
    },
    getPurchaseUnits () {
      return [
        {
          reference_id: store.getters['cart/getCartToken'],
          // payment_instruction: '',
          description: 'Need to return an item? We accept returns for unused items in packaging 60 days after you order', // purchase description
          items: this.getProducts(),
          amount: this.getAmount(),
          shipping: this.getShippingAddress()
        }
      ]
    },
    getProducts () {
      let products = []
      store.state.cart.cartItems.forEach(product => {
        products.push({
          name: product.name,
          unit_amount: {
            currency_code: this.currencyCode,
            value: product.totals.base_price_incl_tax.toFixed(2)
          },
          // tax: {
            // currency_code: this.currencyCode,
            // value: ''
            // optional tax already set in totals, this is not needed
            // value: (product.totals.price_incl_tax - product.totals.price).toFixed(2)
          // },
          description: (product.options && product.options.length > 0) ? product.options.map((el) => { return el.value }).join(',') : '',
          quantity: product.qty,
          sku: product.sku,
          category: 'PHYSICAL_GOODS'
        })
      })
      return products
    },
    getBillingAddress () {
      return {
        address_line_1: store.state.checkout.paymentDetails.streetAddress,
        address_line_2: store.state.checkout.paymentDetails.apartmentNumber,
        admin_area_1: store.state.checkout.paymentDetails.region_code,
        admin_area_2: store.state.checkout.paymentDetails.city,
        postal_code: store.state.checkout.paymentDetails.zipCode,
        country_code: store.state.checkout.paymentDetails.country
      }
    },
    getShippingAddress () {
      return {
        name: {
          full_name: store.state.checkout.shippingDetails.firstName + ' ' + store.state.checkout.shippingDetails.lastName
        },
        address: {
          address_line_1: store.state.checkout.shippingDetails.streetAddress,
          address_line_2: store.state.checkout.shippingDetails.apartmentNumber,
          admin_area_1: store.state.checkout.shippingDetails.region_code,
          admin_area_2: store.state.checkout.shippingDetails.city,
          postal_code: store.state.checkout.shippingDetails.zipCode,
          country_code: store.state.checkout.shippingDetails.country
        }
      }
    },
    getAmount () {
      const grandTotals = this.$store.state.cart.platformTotalSegments.find(item => item.code === 'grand_total');
      let grandTotalsValue = grandTotals.value
      if (this.$store.state.cart.platformTotals.discount_amount < 0) {
        grandTotalsValue = this.$store.state.cart.platformTotals.subtotal_incl_tax + this.$store.state.cart.platformTotals.shipping_incl_tax
          + this.$store.state.cart.platformTotals.discount_amount
      }

      return {
        breakdown: {
          item_total: {
            currency_code: this.currencyCode,
            value: this.$store.state.cart.platformTotals.subtotal_incl_tax
          },
          shipping: {
            currency_code: this.currencyCode,
            value: this.$store.state.cart.platformTotals.base_shipping_incl_tax
          },
          discount: {
            currency_code: this.currencyCode,
            value: this.getSegmentTotal('discount')
          },
          tax_total: {
            currency_code: this.currencyCode,
            value: 0 //this.getSegmentTotal('tax')
          }
        },
        value: grandTotalsValue,
        currency_code: this.currencyCode
      }
    },
    async createOrderNvp (data, actions) {
      return store.dispatch('cart/syncTotals', {
        methodsData: {
          country: store.state.checkout.shippingDetails.country,
          zipCode: store.state.checkout.shippingDetails.zipCode,
          region: store.state.checkout.shippingDetails.region,
          region_id: store.state.checkout.shippingDetails.regionId,
          region_code: store.state.checkout.shippingDetails.regionCode,
          method_code: store.state.checkout.shippingDetails.shippingMethod,
          carrier_code: store.state.checkout.shippingDetails.shippingCarrier,
          payment_method: null
        },
        forceServerSync: true
      }).then(() => {
        // create order using Server Side methods same as magento 2....
        return store.dispatch('payment-paypal-magento2/setExpressCheckout', {
          cart_id: store.getters['cart/getCartToken'],
          brand_name: '',
          locale: this.locale,
          currency_code: this.currencyCode,
          purchase_units: this.getPurchaseUnits(),
          user_token: store.getters['user/getUserToken'],
          email: store.state.checkout.personalDetails.emailAddress,
          return_url: 'https://www.paypal.com/checkoutnow/error',
          cancel_url: 'https://www.paypal.com/checkoutnow/error',
          total_type: 'EstimatedTotal',
          logo: ''
        }).then((result) => {
          this.tokenId = result.token
          return this.tokenId
        })
      })
    },
    async createOrderRest (data, actions) {
      return store.dispatch('cart/syncTotals', {
        methodsData: {
          country: store.state.checkout.shippingDetails.country,
          zipCode: store.state.checkout.shippingDetails.zipCode,
          region: store.state.checkout.shippingDetails.region,
          region_id: store.state.checkout.shippingDetails.regionId,
          region_code: store.state.checkout.shippingDetails.regionCode,
          method_code: store.state.checkout.shippingDetails.shippingMethod,
          carrier_code: store.state.checkout.shippingDetails.shippingCarrier,
          payment_method: null
        },
        forceServerSync: true
      }).then(() => {
        return actions.order.create({
          purchase_units: this.getPurchaseUnits(),
          application_context: {
            brand_name: '',
            shipping_preference: 'SET_PROVIDED_ADDRESS'
          }
        })
      })
    },
    async onApprove (data, actions) {
      const totals = this.$store.getters['cart/getTotals']

      let additionalMethod = {
        // magento 2 fields expects
        paypal_express_checkout_token: this.tokenId,
        button: 1,
        paypal_express_checkout_payer_id: data.payerID,
        paypal_express_checkout_redirect_required: false
      }
      this.$bus.$emit('checkout-do-placeOrder', additionalMethod)
    },
    onCancel (data) {
      this.$emit('payment-paypal-cancelled', data)
    }
  }
}
</script>

<style lang="scss">
  .paypal-button {
    transition: opacity .3s;
  }
  .paypal-button--disabled {
    opacity: .3;
    pointer-events: none;
  }
</style>