<?php
/**
 * KD Pay WooCommerce Gateway Class
 *
 * path: plugins/woocommerce-kd-pay/class-wc-gateway-kd-pay.php
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Gateway_KD_Pay extends WC_Payment_Gateway {
    public function __construct() {
        $this->id = 'kd_pay';
        $this->icon = '';
        $this->has_fields = false;
        $this->method_title = 'KD Solution IT Pay';
        $this->method_description = 'Accept credit cards and alternative payment methods via KD Solution IT PayFac.';

        $this->init_form_fields();
        $this->init_settings();

        $this->title = $this->get_option('title');
        $this->description = $this->get_option('description');
        $this->enabled = $this->get_option('enabled');
        $this->testmode = 'yes' === $this->get_option('testmode');

        add_action('woocommerce_update_options_payment_gateways_' . $this->id, array($this, 'process_admin_options'));
    }

    public function init_form_fields() {
        $this->form_fields = array(
            'enabled' => array(
                'title'   => 'Enable/Disable',
                'type'    => 'checkbox',
                'label'   => 'Enable KD Pay Gateway',
                'default' => 'yes',
            ),
            'title' => array(
                'title'       => 'Title',
                'type'        => 'text',
                'description' => 'Payment method title shown during checkout.',
                'default'     => 'Credit Card (KD Pay)',
                'desc_tip'    => true,
            ),
            'testmode' => array(
                'title'       => 'Test Mode',
                'type'        => 'checkbox',
                'label'       => 'Enable Test Mode / Developer Sandbox',
                'default'     => 'yes',
                'description' => 'Simulate transactions without charging real cards.',
            ),
            'publishable_key' => array(
                'title'       => 'Publishable Key',
                'type'        => 'text',
                'description' => 'Your KD Pay Publishable API Key (pk_live_... or pk_test_...).',
            ),
            'secret_key' => array(
                'title'       => 'Secret Key',
                'type'        => 'password',
                'description' => 'Your KD Pay Secret API Key (sk_live_... or sk_test_...).',
            ),
            'webhook_secret' => array(
                'title'       => 'Webhook Secret',
                'type'        => 'password',
                'description' => 'Your Webhook Signing Secret for payment callback verification.',
            ),
        );
    }

    public function process_payment($order_id) {
        $order = wc_get_order($order_id);
        $amount = $order->get_total();
        $return_url = $this->get_return_url($order);

        // Call KD Pay Hosted Checkout API
        return array(
            'result'   => 'success',
            'redirect' => 'https://checkout.kdsolution.it/pay/cs_woo_' . $order_id,
        );
    }
}
