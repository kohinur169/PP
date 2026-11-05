<?php
/**
 * Plugin Name: KD Solution IT PayFac for WooCommerce
 * Plugin URI: https://kdsolution.it/developers/woocommerce
 * Description: Official Payment Gateway for WooCommerce powered by KD Solution IT PayFac.
 * Version: 1.0.0
 * Author: KD Solution IT
 * Author URI: https://kdsolution.it
 * Text Domain: woocommerce-kd-pay
 *
 * path: plugins/woocommerce-kd-pay/woocommerce-kd-pay.php
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

add_action('plugins_loaded', 'init_kd_pay_gateway');

function init_kd_pay_gateway() {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    require_once plugin_dir_path(__FILE__) . 'class-wc-gateway-kd-pay.php';

    add_filter('woocommerce_payment_gateways', 'add_kd_pay_gateway');
}

function add_kd_pay_gateway($gateways) {
    $gateways[] = 'WC_Gateway_KD_Pay';
    return $gateways;
}
