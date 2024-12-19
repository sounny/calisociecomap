(function() {
    var attrArray = ["Median income per household", "Mean income per household", "Population", "GDP in Thousands of Chained Dollars", "Average Monthly Unemployment"];
    var expressed = attrArray[1]; 
    var selectedCounty = null;

    window.onload = initialize;

    function initialize(){
        createDropdown();
        setMap();
    }

    function setMap() {
        var width = window.innerWidth * 0.5,
            height = 800;

        var zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", zoomed);

        var svg = d3.select("#mapContainer")
            .append("svg")
            .attr("class", "map")
            .attr("width", width)
            .attr("height", height)
            .call(zoom)
            .on("click", reset);

        // Add a title across the top
        svg.append("text")
           .attr("class", "mapTitle")
           .attr("x", width / 2)
           .attr("y", 30)
           .style("text-anchor", "middle")
           .style("font-size", "24px")
           .text("California Socioeconomic Choropleth Mapper");

        var map = svg.append("g");

        var projection = d3.geoConicEqualArea()
            .parallels([33, 45])
            .scale(4500)
            .translate([-270, 780])
            .rotate([120, 0])
            .center([-5, 34]);

        var path = d3.geoPath().projection(projection);

        var promises = [];
        promises.push(d3.csv("data/Cali_County_Data.csv"));
        promises.push(d3.json("data/Surrounding_Cali_States_Provinces.topojson"));
        promises.push(d3.json("data/California_Counties.topojson"));
        Promise.all(promises).then(callback).catch(function(error) {
            console.error("Error loading data: ", error);
        });

        function callback(data) {
            var csvData = data[0],
                caliCounties = data[2],
                surrounding = data[1];

            var californiaCounties = topojson.feature(caliCounties, caliCounties.objects.California_Counties).features;
            var surroundingStates = topojson.feature(surrounding, surrounding.objects.Surrounding_Cali_States_Provinces).features;

            setGraticule(map, path, surroundingStates);
            joinData(californiaCounties, csvData);

            var colorScale = makeColorScale(californiaCounties);

            setEnumerationUnits(californiaCounties, map, path, colorScale);
            setChart(csvData, colorScale, expressed);
            createLegend(colorScale, width);

            function clicked(event, d) {
                event.stopPropagation();
                d3.selectAll(".counties.highlighted").classed("highlighted", false);

                const [[x0, y0], [x1, y1]] = path.bounds(d);
                d3.select(this).classed("highlighted", true);
                selectedCounty = d.properties.California_County;

                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity
                    .translate(width / 2, height / 2)
                    .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
                    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
                    d3.pointer(event, svg.node())
                );
            }

            d3.selectAll(".counties").on("click", clicked);

            d3.selectAll(".counties")
              .on("mouseover", function(event, d) {
                showTooltip(event, d.properties.California_County, d.properties[expressed]);
                highlight(d.properties.California_County);
              })
              .on("mousemove", moveTooltip)
              .on("mouseout", function(event, d) {
                hideTooltip();
                dehighlight(d.properties.California_County);
              });
        }

        function zoomed(event) {
            const {transform} = event;
            map.attr("transform", transform);
            map.attr("stroke-width", 1 / transform.k);
        }

        function reset() {
            d3.selectAll(".counties.highlighted").classed("highlighted", false);
            selectedCounty = null;
            d3.selectAll(".counties")
                .transition()
                .style("fill", null);

            d3.select("svg.map").transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity,
                d3.zoomTransform(d3.select("svg.map").node()).invert([window.innerWidth * 0.5 / 2, 800 / 2])
            );
        }
    }

    function highlight(countyName) {
        var countyID = countyName.replace(/\s+/g, '_');
        d3.select("#" + countyID).classed("highlighted", true);
        d3.select("#" + countyID + "_bar").classed("highlighted", true);
    }

    function dehighlight(countyName) {
        var countyID = countyName.replace(/\s+/g, '_');
        if (countyName !== selectedCounty) {
            d3.select("#" + countyID).classed("highlighted", false);
        }
        d3.select("#" + countyID + "_bar").classed("highlighted", false);
    }

    function showTooltip(event, name, value) {
        var tooltip = d3.select("#tooltip");
        tooltip.style("display", "block")
               .html("<strong>" + name + "</strong><br>" + expressed + ": " + value);
        moveTooltip(event);
    }

    function moveTooltip(event) {
        var tooltip = d3.select("#tooltip");
        var x = event.pageX + 10;
        var y = event.pageY + 10;
        tooltip.style("left", x + "px")
               .style("top", y + "px");
    }

    function hideTooltip() {
        d3.select("#tooltip").style("display", "none");
    }

    function createDropdown() {
        var dropdown = d3.select("#attributeSelect");
        dropdown.selectAll("option")
            .data(attrArray)
            .enter()
            .append("option")
            .attr("value", function(d){ return d; })
            .text(function(d){ return d; });

        dropdown.on("change", function(e) {
            expressed = e.target.value;
            updateMapAndChart();
        });
    }

    function updateMapAndChart() {
        d3.csv("data/Cali_County_Data.csv").then(function(csvData) {
            d3.json("data/California_Counties.topojson").then(function(caliCounties) {
                var californiaCounties = topojson.feature(caliCounties, caliCounties.objects.California_Counties).features;
                joinData(californiaCounties, csvData);
                var colorScale = makeColorScale(californiaCounties);

                d3.selectAll(".counties")
                  .transition()
                  .style("fill", function(d) {
                      return colorScale(d.properties[expressed]);
                  });

                setChart(csvData, colorScale, expressed);
                createLegend(colorScale, window.innerWidth * 0.5);
            });
        });
    }

    function makeColorScale(data){
        var colorClasses = ["#D4B9DA","#C994C7","#DF65B0","#DD1C77","#980043"];
        var colorScale = d3.scaleThreshold().range(colorClasses);

        var domainArray = [];
        for (var i = 0; i < data.length; i++) {
            var val = parseFloat(data[i].properties[expressed]);
            domainArray.push(val);
        }

        var clusters = ss.ckmeans(domainArray, 5);
        domainArray = clusters.map(function(d){
            return d3.min(d);
        });
        domainArray.shift();
        colorScale.domain(domainArray);

        return colorScale;
    }

    function setGraticule(map, path, surroundingStates) {
        var graticule = d3.geoGraticule().step([5, 5]);

        map.append("path")
           .datum(graticule.outline())
           .attr("class", "gratBackground")
           .attr("d", path);

        map.selectAll(".gratLines")
           .data(graticule.lines())
           .enter()
           .append("path")
           .attr("class", "gratLines")
           .attr("d", path);

        map.selectAll(".states")
           .data(surroundingStates)
           .enter()
           .append("path")
           .attr("class", function(d) {
               return "states " + d.properties.name;
           })
           .attr("d", path);
    }

    function joinData(californiaCounties, csvData) {
        for (var i = 0; i < csvData.length; i++) {
            var csvRegion = csvData[i];
            var csvKey = csvRegion.California_County;

            for (var a = 0; a < californiaCounties.length; a++) {
                var geojsonProps = californiaCounties[a].properties;
                var geojsonKey = geojsonProps.NAME_ALT;

                if (geojsonKey == csvKey) {
                    geojsonProps.California_County = csvKey;
                    attrArray.forEach(function(attr) {
                        var val = parseFloat(csvRegion[attr]);
                        geojsonProps[attr] = val;
                    });
                }
            }
        }
    }

    function setEnumerationUnits(californiaCounties, map, path, colorScale){
        map.selectAll(".counties").remove();

        map.selectAll(".counties")
            .data(californiaCounties)
            .enter()
            .append("path")
            .attr("class", function(d) {
                return "counties " + d.properties.California_County;
            })
            .attr("id", function(d) {
                return d.properties.California_County.replace(/\s+/g, '_');
            })
            .attr("d", path)
            .style("fill", function(d) {
                return colorScale(d.properties[expressed]);
            });
    }

    function setChart(csvData, colorScale, expressed){
        d3.select("#chartContainer").selectAll("svg").remove();

        var chartWidth = window.innerWidth * 0.425,
            chartHeight = 500,
            leftPadding = 50,
            rightPadding = 2,
            topBottomPadding = 5,
            chartInnerWidth = chartWidth - leftPadding - rightPadding,
            chartInnerHeight = chartHeight - topBottomPadding * 2,
            translate = "translate(" + leftPadding + "," + topBottomPadding + ")";

        var chart = d3.select("#chartContainer")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");

        chart.append("rect")
            .attr("class", "chartBackground")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);

        var yScale = d3.scaleLinear()
            .range([chartInnerHeight, 20])
            .domain([0, d3.max(csvData, function(d) { return parseFloat(d[expressed]); })]);

        var bars = chart.selectAll(".bar")
            .data(csvData)
            .enter()
            .append("rect")
            .sort(function(a, b){
                return a[expressed] - b[expressed];
            })
            .attr("class", "bar")
            .attr("id", function(d){
                return d.California_County.replace(/\s+/g, '_') + "_bar";
            })
            .attr("width", chartInnerWidth / csvData.length - 1)
            .attr("x", function(d, i){
                return i * (chartInnerWidth / csvData.length) + leftPadding;
            })
            .attr("height", function(d){
                return chartInnerHeight - yScale(parseFloat(d[expressed]));
            })
            .attr("y", function(d){
                return yScale(parseFloat(d[expressed])) + 5;
            })
            .style("fill", function(d){
                return colorScale(d[expressed]);
            })
            .on("mouseover", function(event, d) {
                showTooltip(event, d.California_County, d[expressed]);
                highlight(d.California_County);
            })
            .on("mousemove", moveTooltip)
            .on("mouseout", function(event, d) {
                hideTooltip();
                dehighlight(d.California_County);
            });

        chart.append("text")
            .attr("x", 100)
            .attr("y", 40)
            .attr("class", "chartTitle")
            .text(expressed);

        var yAxis = d3.axisLeft().scale(yScale).tickFormat(d3.format(".0f"));

        chart.append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis);

        chart.append("rect")
            .attr("class", "chartFrame")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);
    }

    function createLegend(colorScale, width) {
        d3.selectAll(".legend").remove();

        var legendHeight = 60;
        var legendWidth = width;
        var colorRange = colorScale.range();
        var domain = colorScale.domain();
        var numClasses = colorRange.length;

        var legend = d3.select("#mapContainer").append("svg")
            .attr("class", "legend")
            .attr("width", legendWidth)
            .attr("height", legendHeight);

        // Scale to position each color box evenly
        var xScale = d3.scaleLinear()
            .domain([0, numClasses])
            .range([20, legendWidth - 20]); 

        // Calculate the width of each box
        var boxWidth = (legendWidth - 40) / numClasses;

        legend.selectAll("rect")
            .data(colorRange)
            .enter()
            .append("rect")
            .attr("x", function(d,i) { return xScale(i); })
            .attr("y", 20)
            .attr("width", boxWidth)
            .attr("height", 15)
            .style("fill", function(d) { return d; });

        var extents = [0].concat(domain);

        legend.selectAll("text")
            .data(extents)
            .enter()
            .append("text")
            .attr("x", function(d, i) { 
                return xScale(i); 
            })
            .attr("y", 50)
            .text(function(d) { return Math.round(d); });
    }
})();
