import $ from 'jquery';
import "./style.css";
import idb from 'idb';
import moment from 'moment';

const dbPromise = idb.open("keyval-store", 2, upgradeDatabase => {
    switch (upgradeDatabase.oldVersion) {
        case 0:
            upgradeDatabase.createObjectStore("countries", {
                keyPath: "id",
                autoIncrement: true
            });
        case 1:
            upgradeDatabase.createObjectStore("countries-currencies", {
                keyPath: "key"
            });
    }
});

window.onload = onInit();

let fromValue = null;
let toValue = null;
let convertValue;
let finalToValue = null;
let finalFromValue = null;
let previousInput = null;
let fromChanged = true;
let count;

function onInit() {
    pullDatabaseValues();

    $(".input-to").attr('disabled', true);
    $(".input-from").attr('disabled', true);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
            console.log('Service worker live', reg);
        }).catch((err) => {
            console.log('Error setting up service worker', err);
        });
    }
}

function fetchCountries() {
    fetch("https://free.currencyconverterapi.com/api/v5/countries")
        .then(response => {
            if (response.ok) {
                return Promise.resolve(response);
            } else {
                return Promise.reject(new Error("Failed to load"));
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log("Request successfull");
            populateDatabaseCountries(data.results);
            populateFromDropdowns(data.results);
            populateToDropdowns(data.results);
        })
        .catch(function (error) {
            alert("Sorry a connection issue has occured. Please try again later.")
            console.log(`Error: ${error.message}`);
        });
}

function populateFromDropdowns(data) {
    $.each(data, function (i, country) {
        let a = `<a class='dropdown-item country-from' href='#' value="${country.currencyId}">${country.currencyName}</a>`;
        $(".countries-from").append(a);
    })
    populateToDropdowns(data);
}

function populateToDropdowns(data) {
    $.each(data, function (i, country) {
        let a = `<a class='dropdown-item country-to' href='#' value="${country.currencyId}">${country.currencyName}</a>`;
        $(".countries-to").append(a);
    })
    addInputEvents()
}

function addInputEvents() {

    $('.country-from').on('click', function () {
        fromValue = $(this).attr('value');
        $(".country-text-from").text($(this).text());
        checkCurrencies();
    });

    $('.country-to').on('click', function () {
        toValue = $(this).attr('value');
        $(".country-text-to").text($(this).text());
        checkCurrencies();
    });

    $('.input-from').on('input', function () {
        finalToValue = ($(this).val() * convertValue);
        $('.input-to').val(finalToValue);
        fromChanged = true;
        console.log("input from")
    })

    $('.input-to').on('input', function () {
        finalFromValue = ($(this).val() / convertValue);
        $('.input-from').val(finalFromValue);
        fromChanged = false;
        console.log("input to")
    })
}

function checkCurrencies() {
    if (fromValue != undefined && toValue != undefined && count == 0) {

        count++;

        pullDatabaseCountryCurrencies();

        $(".input-to").attr('disabled', false);
        $(".input-from").attr('disabled', false);
    } else {
        count = 0;
    }
}

function inputChange() {
    if (fromChanged) {
        $(".input-from").trigger("input");
    } else {
        $(".input-to").trigger("input");
    }
}

function convertCurrency() {

    fetch(`https://free.currencyconverterapi.com/api/v5/convert?q=${fromValue}_${toValue}`)
        .then(response => {
            if (response.ok) {
                return Promise.resolve(response);
            } else {
                return Promise.reject(new Error("Failed to load"));
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log("Request successfull");

            convertValue = data.results[`${fromValue}_${toValue}`].val;

            populateDatabaseCountriesCurrencies(`${fromValue}_${toValue}`, convertValue)

            inputChange();
        })
        .catch(function (error) {
            alert("Sorry a connection issue has occured. Please try again later.")
            console.log(`Error: ${error.message}`);
        });
}

function populateDatabaseCountries(data) {
    for (let country in data) {
        let item = data[country];
        dbPromise.then(db => {
            const tx = db.transaction("countries", "readwrite");
            tx.objectStore("countries").put({
                currencyName: item.currencyName,
                currencyId: item.currencyId
            });
            return tx.complete;
        });
    }
}

function pullDatabaseValues() {
    dbPromise.then(db => {
        return db
            .transaction("countries")
            .objectStore("countries")
            .getAll();
    }).then(data => {
        if (data.length) {
            populateFromDropdowns(data);
            populateToDropdowns(data);
        } else {
            fetchCountries();
        }
    });

}

function pullDatabaseCountryCurrencies() {
    dbPromise.then(db => {
        return db
            .transaction("countries-currencies")
            .objectStore("countries-currencies")
            .get(`${fromValue}_${toValue}`);
    }).then(data => {
        if (data != undefined) {
            let timeAdded = data.dateUpdated;

            let currentTime = moment();

            if (currentTime.isAfter(moment(timeAdded).add(60, 'minutes'))) {
                convertCurrency();
            } else {
                convertValue = data.currencyValue;
                inputChange();
            }
        } else {
            convertCurrency();
        }
    });
}

function populateDatabaseCountriesCurrencies(countryIds, value) {
    dbPromise.then(db => {
        const tx = db.transaction("countries-currencies", "readwrite");
        tx.objectStore("countries-currencies").put({
            key: countryIds,
            currencyValue: value,
            dateUpdated: moment().format()
        });
        return tx.complete;
    });
}